import { expect, test, type Page } from "@playwright/test";
import { encode } from "next-auth/jwt";
import JSZip from "jszip";

// Real workspace UI/RTK requests with deterministic API responses. The companion
// PostgreSQL tests verify actual persistence, concurrency, ownership and acceptance.
const cityId = "f8063baa-e795-4ffb-a507-7a2ea6090eae";
const runId = "e7cca88d-de54-4050-88ed-d6b39790853b";
const ids = [
  "10000000-0000-4000-8000-000000000001",
  "10000000-0000-4000-8000-000000000002",
];
const initial = ids.map((id, index) => ({
  chapter_id: id,
  template_section_id: index ? "budget" : "summary",
  required: index === 0,
  title: index ? "Budget" : "Summary",
  description: index ? "Budget guidance" : "Summary guidance",
}));

async function setup(page: Page, chat = false, chapterCount = 2) {
  const fixtureChapters = [
    ...initial,
    ...Array.from({ length: chapterCount - 2 }, (_, index) => ({
      chapter_id: `10000000-0000-4000-8000-${String(index + 3).padStart(12, "0")}`,
      template_section_id: `supporting-${index + 3}`,
      required: true,
      title: `Supporting chapter ${index + 3}`,
      description: "Detailed application guidance. ".repeat(12),
    })),
  ];
  if (process.env.CNB_BROWSER_TEST_SECRET) {
    const value = await encode({
      secret: process.env.CNB_BROWSER_TEST_SECRET,
      token: {
        sub: "owner",
        name: "Structure reviewer",
        email: "review@example.test",
      },
    });
    await page.context().addCookies([
      {
        name: "next-auth.session-token",
        value,
        url: process.env.CNB_BROWSER_TEST_URL ?? "http://127.0.0.1:3046",
      },
    ]);
  }
  let state = {
    fingerprint: "a".repeat(64),
    chapters: structuredClone(fixtureChapters),
  };
  let failure = 0;
  let applyFailure = 0;
  let applied = false;
  let saves = 0;
  const proposal = {
    proposal_id: "20000000-0000-4000-8000-000000000001",
    run_id: runId,
    instruction: "Rename and reorder chapters",
    scope: { kind: "auto" },
    status: "proposed",
    base_revisions: {},
    changes: [],
    notices: [],
    clarification: null,
    error_code: null,
    result: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    structure: {
      before: structuredClone(state),
      after: [
        initial[1],
        {
          ...initial[0],
          title: "Project overview",
          description: "Updated guidance",
        },
        ...fixtureChapters.slice(2),
      ],
    },
  };
  await page.route("**/api/auth/session/**", (route) =>
    route.fulfill({
      json: {
        user: { id: "owner", name: "Reviewer", email: "review@example.test" },
        expires: "2099-01-01T00:00:00Z",
      },
    }),
  );
  await page.route("**/api/v1/**", async (route) => {
    const path = new URL(route.request().url()).pathname.replace(/\/$/, "");
    if (path === "/api/v1/user/access-status")
      return route.fulfill({
        json: { data: { isCollaborator: true, organizationId: "test" } },
      });
    if (path === "/api/v1/user")
      return route.fulfill({
        json: {
          data: {
            userId: "owner",
            name: "Reviewer",
            preferredLanguage: "en",
            role: "user",
          },
        },
      });
    if (path === `/api/v1/city/${cityId}`)
      return route.fulfill({
        json: { data: { cityId, name: "Krakow", country: "Poland" } },
      });
    if (path === "/api/v1/user/projects") return route.fulfill({ json: [] });
    if (path.includes("/modules/") && path.endsWith("/access"))
      return route.fulfill({ json: { data: { hasAccess: true } } });
    if (!path.includes(`/concept-notes/${runId}`))
      return route.fulfill({ json: { data: [] } });
    if (path.endsWith("/structure")) {
      if (route.request().method() === "PUT") {
        if (failure) {
          const status = failure;
          failure = 0;
          return route.fulfill({
            status,
            json: {
              code: status === 409 ? "stale_structure" : "storage_unavailable",
            },
          });
        }
        const body = route.request().postDataJSON();
        expect(body.expected_fingerprint).toBe(state.fingerprint);
        state = { fingerprint: "b".repeat(64), chapters: body.chapters };
        saves++;
      }
      return route.fulfill({ json: state });
    }
    if (path.endsWith("/application-context"))
      return route.fulfill({
        json: {
          run_id: runId,
          city_id: cityId,
          funder: { id: ids[0], name: "Test funder" },
          opportunity: { id: ids[1], name: "Test opportunity" },
          template: {
            id: ids[0],
            name: "Application",
            chapter_schema: fixtureChapters.map((c) => ({
              chapter_ref: c.template_section_id,
              ...c,
            })),
          },
          included_sources: { city: true, project: true },
        },
      });
    if (path.endsWith("/validation"))
      return route.fulfill({
        json: {
          chapter_id: path.split("/").at(-2),
          status: "ready",
          is_stale: false,
          validated_revision_number: 1,
          validated_at: new Date().toISOString(),
          checks: [],
          findings: [],
        },
      });
    if (path.endsWith("/draft"))
      return route.fulfill({
        json: {
          run_id: runId,
          status:
            state.chapters.length > fixtureChapters.length
              ? "not_started"
              : "complete",
          total_chapters: state.chapters.length,
          completed_chapters: fixtureChapters.length,
          chapters: state.chapters.map((c, position) => ({
            ...c,
            position,
            status: "draft",
            user_locked: false,
            body_markdown: fixtureChapters.some(
              (saved) => saved.chapter_id === c.chapter_id,
            )
              ? `## ${c.title}\n\nContent belonging to ${c.chapter_id}.`
              : "",
            gaps: [],
            open_gap_count: 0,
            caveat_count: 0,
            revision_number: 1,
          })),
        },
      });
    if (path.endsWith("/edit-proposals"))
      return route.fulfill({ json: chat && !applied ? [proposal] : [] });
    if (path.endsWith("/apply")) {
      if (applyFailure) {
        const status = applyFailure;
        applyFailure = 0;
        return route.fulfill({ status, json: { code: "storage_unavailable" } });
      }
      applied = true;
      state = {
        fingerprint: "c".repeat(64),
        chapters: proposal.structure.after,
      };
      return route.fulfill({ json: { ...proposal, status: "applied" } });
    }
    if (path.endsWith(`/${runId}`))
      return route.fulfill({
        json: {
          run_id: runId,
          city_id: cityId,
          user_id: "owner",
          name: "Chapter structure test",
          status: "active",
          workflow_step: "assembling_context",
          thread_id: null,
          uploads: [],
          progress_summary: {
            context_bundle: { status: "ready", ready_sources: 1 },
          },
        },
      });
    return route.fulfill({ json: {} });
  });
  await page.goto(`/en/cities/${cityId}/concept-notes/${runId}/`);
  return {
    failNext: (status: number) => {
      failure = status;
    },
    failNextApply: (status: number) => {
      applyFailure = status;
    },
    state: () => state,
    saves: () => saves,
    applied: () => applied,
  };
}

test("drag, keyboard, edit all chapters, validate, save, reload and recover", async ({
  page,
}) => {
  // Keep both drag targets visible under the default CI and dedicated configs.
  await page.setViewportSize({ width: 1440, height: 1000 });
  const fixture = await setup(page);
  await page.getByRole("tab", { name: "Structure", exact: true }).click();
  const title = (position: number) =>
    page.getByRole("textbox", {
      name: `Title for chapter ${position}`,
      exact: true,
    });
  await expect(title(1)).toHaveValue("Summary");
  await page
    .getByRole("button", { name: "Drag Summary", exact: true })
    .dragTo(page.getByTestId("structure-chapter").nth(1));
  await expect(title(1)).toHaveValue("Budget");
  await page.getByRole("button", { name: "Drag Summary", exact: true }).focus();
  await page.keyboard.press("ArrowUp");
  await expect(title(1)).toHaveValue("Summary");
  await title(1).fill(" ");
  await page
    .getByRole("button", { name: "Save structure", exact: true })
    .click();
  await expect(
    page.getByRole("alert").filter({ hasText: "nonempty" }),
  ).toBeVisible();
  await title(1).fill("All chapters editable");
  await page
    .getByRole("textbox", { name: "Description for chapter 1", exact: true })
    .fill("New required chapter guidance");
  await page
    .getByRole("button", { name: "Add custom chapter", exact: true })
    .click();
  await title(3).fill("Community");
  await page
    .getByRole("textbox", { name: "Description for chapter 3", exact: true })
    .fill("Engagement details");
  fixture.failNext(503);
  await page
    .getByRole("button", { name: "Save structure", exact: true })
    .click();
  await expect(
    page.getByRole("alert").filter({ hasText: "Could not save" }),
  ).toBeVisible();
  await expect(title(1)).toHaveValue("All chapters editable");
  await page
    .getByRole("button", { name: "Save structure", exact: true })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: "Chapter structure saved" }),
  ).toBeVisible();
  expect(fixture.saves()).toBe(1);
  expect(fixture.state().chapters[0].chapter_id).toBe(ids[0]);
  await page.reload();
  await expect(page.getByTestId("concept-note-draft-preview")).toContainText(
    `Content belonging to ${ids[0]}.`,
  );
  await expect(
    page.getByRole("button", { name: "Continue drafting", exact: true }),
  ).toBeVisible();
  await page.getByRole("tab", { name: "Structure", exact: true }).click();
  await expect(title(1)).toHaveValue("All chapters editable");
  await expect(title(3)).toHaveValue("Community");
  await expect(
    page.getByRole("button", { name: "Remove All chapters editable" }),
  ).toHaveCount(0);
  await title(1).fill("Unsaved local edit");
  fixture.failNext(409);
  await page
    .getByRole("button", { name: "Save structure", exact: true })
    .click();
  await expect(
    page.getByRole("alert").filter({ hasText: "changed elsewhere" }),
  ).toBeVisible();
  await expect(title(1)).toHaveValue("Unsaved local edit");
  await page
    .getByRole("button", { name: "Discard edits and reload", exact: true })
    .click();
  await expect(title(1)).toHaveValue("All chapters editable");
  await page
    .getByRole("button", { name: "Remove Community", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Save structure", exact: true })
    .click();
  await expect(title(3)).toHaveCount(0);
  await page.screenshot({
    path: "test-results/cc864-structure.png",
    fullPage: true,
  });
});

test("unsaved structure survives internal navigation and clears only after save or discard", async ({
  page,
}) => {
  const fixture = await setup(page);
  await page.getByRole("tab", { name: "Structure", exact: true }).click();
  const title = page.getByRole("textbox", {
    name: "Title for chapter 1",
    exact: true,
  });
  await title.fill("");
  await page.getByRole("link", { name: "All concept notes" }).click();
  await expect(page).toHaveURL(
    new RegExp(`/cities/${cityId}/concept-notes/?$`),
  );
  await page.goBack();
  await expect(page).toHaveURL(new RegExp(`/concept-notes/${runId}/?$`));
  await page.getByRole("tab", { name: "Structure", exact: true }).click();
  await expect(title).toHaveValue("");
  expect(fixture.saves()).toBe(0);
  await title.fill("Recovered overview");
  await page
    .getByRole("button", { name: "Save structure", exact: true })
    .click();
  await expect.poll(fixture.saves).toBe(1);
  await expect
    .poll(() =>
      page.evaluate(
        (key) => sessionStorage.getItem(key),
        `cnb-structure-draft:${runId}`,
      ),
    )
    .toBeNull();
  await title.fill("Discard this edit");
  await page
    .getByRole("button", { name: "Discard edits and reload", exact: true })
    .click();
  await expect(title).toHaveValue("Recovered overview");
  await expect
    .poll(() =>
      page.evaluate(
        (key) => sessionStorage.getItem(key),
        `cnb-structure-draft:${runId}`,
      ),
    )
    .toBeNull();
});

test("chat structural before/after requires confirmation and updates navigation", async ({
  page,
}) => {
  const fixture = await setup(page, true);
  await page
    .getByRole("button", { name: "Review chapter changes", exact: true })
    .click();
  await expect(page.getByTestId("structure-proposal")).toBeVisible();
  expect(fixture.applied()).toBe(false);
  await expect(
    page.getByTestId("structure-proposal").getByText("Before", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByTestId("structure-proposal").getByText("After", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Confirm structure changes", exact: true })
    .click();
  await expect.poll(fixture.applied).toBe(true);
  await page.getByRole("tab", { name: "Structure", exact: true }).click();
  await expect(
    page.getByRole("textbox", { name: "Title for chapter 1", exact: true }),
  ).toHaveValue("Budget");
  await expect(
    page.getByRole("textbox", { name: "Title for chapter 2", exact: true }),
  ).toHaveValue("Project overview");
  await page.reload();
  await page.getByRole("tab", { name: "Structure", exact: true }).click();
  await expect(
    page.getByRole("textbox", { name: "Title for chapter 2", exact: true }),
  ).toHaveValue("Project overview");
  await page
    .getByRole("button", { name: "Review & export", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Continue to conflicts & logic", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Continue to decision", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Continue to export", exact: true })
    .click();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export DOCX", exact: true }).click();
  const download = await downloadPromise;
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
  const zip = await JSZip.loadAsync(Buffer.concat(chunks));
  const xml = await zip.file("word/document.xml")!.async("string");
  expect(xml).toContain("1. Budget");
  expect(xml).toContain("2. Project overview");
  expect(xml.indexOf("1. Budget")).toBeLessThan(
    xml.indexOf("2. Project overview"),
  );
});

test("unsaved structure edits are flagged stale after a chat structure apply", async ({
  page,
}) => {
  const fixture = await setup(page, true);
  await page.getByRole("tab", { name: "Structure", exact: true }).click();
  const title = (position: number) =>
    page.getByRole("textbox", {
      name: `Title for chapter ${position}`,
      exact: true,
    });
  await title(1).fill("Unsaved local title");
  const save = page.getByRole("button", {
    name: "Save structure",
    exact: true,
  });
  await expect(save).toBeEnabled();
  await page
    .getByRole("button", { name: "Review chapter changes", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Confirm structure changes", exact: true })
    .click();
  await expect.poll(fixture.applied).toBe(true);
  await expect(
    page.getByRole("alert").filter({ hasText: "changed elsewhere" }),
  ).toBeVisible();
  await expect(title(1)).toHaveValue("Unsaved local title");
  await expect(save).toBeDisabled();
  await page
    .getByRole("button", { name: "Discard edits and reload", exact: true })
    .click();
  await expect(title(1)).toHaveValue("Budget");
  await expect(title(2)).toHaveValue("Project overview");
  await expect(
    page.getByRole("alert").filter({ hasText: "changed elsewhere" }),
  ).toHaveCount(0);
  expect(fixture.saves()).toBe(0);
});

test("structure apply failure is shown inside the proposal dialog", async ({
  page,
}) => {
  const fixture = await setup(page, true);
  await page
    .getByRole("button", { name: "Review chapter changes", exact: true })
    .click();
  const dialog = page.getByTestId("structure-proposal");
  fixture.failNextApply(503);
  await page
    .getByRole("button", { name: "Confirm structure changes", exact: true })
    .click();
  await expect(
    dialog.getByRole("alert").filter({ hasText: "could not finish" }),
  ).toBeVisible();
  expect(fixture.applied()).toBe(false);
  await dialog
    .getByRole("button", { name: "Confirm structure changes", exact: true })
    .click();
  await expect.poll(fixture.applied).toBe(true);
  await expect(dialog).toBeHidden();
});

for (const mobile of [false, true]) {
  test(`long structural preview keeps editor and confirmation usable (${mobile ? "mobile" : "desktop"})`, async ({
    page,
  }) => {
    if (mobile) await page.setViewportSize({ width: 390, height: 844 });
    const fixture = await setup(page, true, 12);
    await page.getByRole("tab", { name: "Structure", exact: true }).click();
    const panel = page.getByRole("tabpanel");
    expect((await panel.boundingBox())!.height).toBeGreaterThan(60);
    await page
      .getByRole("textbox", { name: "Description for chapter 1", exact: true })
      .fill("Saved while a long proposal is pending");
    await page
      .getByRole("button", { name: "Save structure", exact: true })
      .click();
    await expect.poll(fixture.saves).toBe(1);
    await page
      .getByRole("button", { name: "Review chapter changes", exact: true })
      .click();
    const scroll = page.getByTestId("structure-preview-scroll");
    await expect(scroll).toBeVisible();
    const bounds = await scroll.evaluate((element) => ({
      height: element.clientHeight,
      content: element.scrollHeight,
    }));
    expect(bounds.height).toBeGreaterThan(60);
    expect(bounds.content).toBeGreaterThan(bounds.height);
    await expect(
      page.getByRole("button", {
        name: "Confirm structure changes",
        exact: true,
      }),
    ).toBeInViewport();
    await page
      .getByRole("button", { name: "Close chapter preview", exact: true })
      .click();
    await expect(
      page.getByRole("textbox", {
        name: "Description for chapter 1",
        exact: true,
      }),
    ).toHaveValue("Saved while a long proposal is pending");
  });
}

test("mobile structure controls remain usable", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await setup(page);
  await page.getByRole("tab", { name: "Structure", exact: true }).click();
  await page
    .getByRole("button", { name: "Move Summary down", exact: true })
    .click();
  await expect(
    page.getByRole("textbox", { name: "Title for chapter 1", exact: true }),
  ).toHaveValue("Budget");
  await page
    .getByRole("button", { name: "Save structure", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Save structure", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Drag Budget", exact: true }),
  ).toBeVisible();
  await page.screenshot({
    path: "test-results/cc864-mobile.png",
    fullPage: true,
  });
});
