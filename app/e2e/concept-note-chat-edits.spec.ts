import { execFileSync } from "node:child_process";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { strFromU8, unzipSync } from "fflate";
import { expect, test, type Locator, type Page } from "@playwright/test";
import type { ConceptNoteDraftState } from "@/util/types";

interface Fixture {
  run_id: string;
  city_id: string;
  chapter_ids: string[];
}

function seed(): Fixture {
  if (!process.env.CA_DATABASE_URL || !process.env.CNB_DATABASE_URL) {
    throw new Error(
      "Set the isolated CA_DATABASE_URL and CNB_DATABASE_URL for the synthetic CC-732 fixture",
    );
  }
  return JSON.parse(
    execFileSync(
      "uv",
      [
        "run",
        "--directory",
        "service",
        "python",
        "-m",
        "scripts.run_cnb_edit_browser_fixture",
        "seed",
      ],
      {
        cwd: path.resolve(process.cwd(), "../climate-advisor"),
        encoding: "utf8",
        timeout: 30_000,
        env: {
          ...process.env,
          MLFLOW_ENABLED: "false",
          OPENROUTER_SMOKE_TEST: "0",
        },
      },
    ),
  );
}

async function openWorkspace(page: Page, fixture: Fixture): Promise<void> {
  await page.goto(
    `/en/cities/${fixture.city_id}/concept-notes/${fixture.run_id}`,
  );
  await expect(page.getByTestId("concept-note-chat-input")).toBeEnabled();
  await expect(page.getByTestId("concept-note-draft-preview")).toContainText(
    "EUR 10 million",
  );
  await expect(page.getByTestId("concept-note-edit-scope")).toHaveCount(0);
}

async function proposeOpening(page: Page): Promise<void> {
  await page
    .getByTestId("concept-note-chat-input")
    .fill("Make the opening more concise");
  await page.getByTestId("concept-note-chat-send").click();
  const header = page.getByTestId("concept-note-document-header");
  const review = header.getByTestId("concept-note-document-review");
  await expect(review).toBeVisible();
  await expect(
    page.getByTestId("concept-note-edit-proposed-text").first(),
  ).toBeInViewport();
  await expect(review.getByTestId("concept-note-edit-apply-all")).toBeVisible();
  await expectInlineReview(page, 1);
  await expect(header.getByTestId("concept-note-edit-apply-all")).toBeVisible();
  await expect(
    header.getByTestId("concept-note-edit-reject-all"),
  ).toBeVisible();
  await expect(header.getByTestId("concept-note-export")).toBeVisible();
  await expect(page.getByTestId("concept-note-review-toolbar")).toHaveCount(0);
  await expect(
    page.getByTestId("concept-note-chat-scroll").locator("[data-proposal-id]"),
  ).toHaveCount(0);
  for (const id of [
    "concept-note-edit-reject-all",
    "concept-note-edit-options",
  ]) {
    const control = review.getByTestId(id);
    await expectReadableReviewControl(control);
    await control.hover();
    await expectReadableReviewControl(control);
    await control.focus();
    await expectReadableReviewControl(control);
  }
}

/** Verify computed foreground against composited panel/hover backgrounds, not token names. */
async function expectReadableReviewControl(control: Locator): Promise<void> {
  await expect(control).toBeVisible();
  const style = await control.evaluate((element) => {
    const computed = getComputedStyle(element);
    const rgba = (color: string) => color.match(/[\d.]+/g)!.map(Number);
    const luminance = (channels: number[]) => {
      const linear = channels.slice(0, 3).map((channel) => {
        const value = channel / 255;
        return value <= 0.04045
          ? value / 12.92
          : ((value + 0.055) / 1.055) ** 2.4;
      });
      return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
    };
    const backgrounds: number[][] = [];
    for (let node: Element | null = element; node; node = node.parentElement)
      backgrounds.push(rgba(getComputedStyle(node).backgroundColor));
    let background = [255, 255, 255];
    for (const channels of backgrounds.reverse()) {
      const alpha = channels[3] ?? 1;
      background = background.map(
        (channel, index) => alpha * channels[index] + (1 - alpha) * channel,
      );
    }
    const fg = luminance(rgba(computed.color));
    const bg = luminance(background);
    return {
      contrast: (Math.max(fg, bg) + 0.05) / (Math.min(fg, bg) + 0.05),
      transform: computed.textTransform,
      radius: Number.parseFloat(computed.borderTopLeftRadius),
    };
  });
  expect(style.contrast).toBeGreaterThanOrEqual(4.5);
  expect(style.transform).toBe("none");
  expect(style.radius).toBeLessThanOrEqual(8);
}

/** Read the complete previous and proposed sentences from their review rows. */
async function reviewedVersions(
  change: Locator,
): Promise<{ before: string; after: string }> {
  return change.evaluate((element) => {
    return {
      before:
        element.querySelector('[data-testid="concept-note-edit-previous-text"]')
          ?.textContent ?? "",
      after:
        element.querySelector('[data-testid="concept-note-edit-proposed-text"]')
          ?.textContent ?? "",
    };
  });
}

async function expectInlineReview(page: Page, count: number): Promise<void> {
  const document = page.getByTestId("concept-note-draft-preview");
  await expect(document.getByTestId("concept-note-inline-change")).toHaveCount(
    count,
  );
  for (const change of await document
    .getByTestId("concept-note-inline-change")
    .all())
    expect(await change.locator("del, ins").count()).toBeGreaterThan(0);
  await expect(
    page.getByTestId("concept-note-chat-scroll").locator("del, ins"),
  ).toHaveCount(0);
  await expect(document.locator('[data-active-change="true"]')).toHaveCount(1);
}

async function draftState(
  page: Page,
  fixture: Fixture,
): Promise<ConceptNoteDraftState> {
  const response = await page.request.get(
    `/api/v1/concept-notes/${fixture.run_id}/draft`,
  );
  expect(response.ok()).toBe(true);
  return response.json();
}

async function askForEdits(page: Page, instruction: string): Promise<void> {
  await page.getByTestId("concept-note-chat-input").fill(instruction);
  await page.getByTestId("concept-note-chat-send").click();
  await expect(page.getByTestId("concept-note-document-review")).toBeVisible();
}

test.describe("CC-732 persisted first edit slice", () => {
  test("document shows red/green review, survives reload and applies only on acceptance", async ({
    page,
  }) => {
    const fixture = seed();
    await openWorkspace(page, fixture);
    const before = await (
      await page.request.get(`/api/v1/concept-notes/${fixture.run_id}/draft`)
    ).json();
    await proposeOpening(page);
    expect(
      await reviewedVersions(page.getByTestId("concept-note-inline-change")),
    ).toEqual({
      before: "The project will create a park that is resilient to floods.",
      after: "The project will create a flood-resilient park.",
    });
    await expect(
      page.getByTestId("concept-note-edit-previous-text").first(),
    ).toHaveText("The project will create a park that is resilient to floods.");
    await expect(
      page.getByTestId("concept-note-edit-proposed-text").first(),
    ).toHaveText("The project will create a flood-resilient park.");
    const proposalId = await page
      .getByTestId("concept-note-document-review")
      .getAttribute("data-proposal-id");
    await expect(
      page
        .getByTestId("concept-note-chat-scroll")
        .locator("[data-proposal-id]"),
    ).toHaveCount(0);
    expect((await draftState(page, fixture)).chapters).toEqual(before.chapters);
    const persistedProposal = await (
      await page.request.get(
        `/api/v1/concept-notes/${fixture.run_id}/edit-proposals/${proposalId}`,
      )
    ).json();
    expect(persistedProposal.status).toBe("proposed");
    await page.reload();
    await expect(
      page.getByTestId("concept-note-document-review"),
    ).toHaveAttribute("data-proposal-id", proposalId!);
    await page.getByTestId("concept-note-edit-apply-all").click();
    await expect(page.getByTestId("concept-note-document-review")).toHaveCount(
      0,
    );
    await expect(page.getByTestId("concept-note-draft-preview")).toContainText(
      "The project will create a flood-resilient park.",
    );
    const after = await (
      await page.request.get(`/api/v1/concept-notes/${fixture.run_id}/draft`)
    ).json();
    expect(after.chapters[0].revision_number).toBe(2);
    expect(after.chapters[0].confirmed_revision_number).toBe(2);
    expect(after.chapters.slice(1)).toEqual(before.chapters.slice(1));
  });
  test("reject all and reload leave persisted draft bytes unchanged", async ({
    page,
  }) => {
    const fixture = seed();
    await openWorkspace(page, fixture);
    const before = await (
      await page.request.get(`/api/v1/concept-notes/${fixture.run_id}/draft`)
    ).json();
    await proposeOpening(page);
    await page.getByTestId("concept-note-edit-reject-all").click();
    await expect(page.getByTestId("concept-note-document-review")).toHaveCount(
      0,
    );
    await page.reload();
    const after = await (
      await page.request.get(`/api/v1/concept-notes/${fixture.run_id}/draft`)
    ).json();
    expect(after.chapters).toEqual(before.chapters);
    await page.getByRole("button", { name: "Export", exact: true }).click();
    const download = page.waitForEvent("download");
    await page
      .getByRole("button", { name: "Export DOCX", exact: true })
      .click();
    const stream = await (await download).createReadStream();
    expect(stream).not.toBeNull();
    const chunks: Buffer[] = [];
    for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
    const exportedText = strFromU8(
      unzipSync(Buffer.concat(chunks))["word/document.xml"],
    ).replace(/[<>]/g, "");
    expect(exportedText).toContain(
      "The project will create a park that is resilient to floods.",
    );
    expect(exportedText).not.toContain(
      "The project will create a flood-resilient park.",
    );
  });

  test("multi-edit arrows, linked selection and reload use real persisted batches", async ({
    page,
  }) => {
    const fixture = seed();
    await openWorkspace(page, fixture);
    const before = await draftState(page, fixture);
    // Navigation is a focus hint; it must not narrow related facts to this chapter.
    await page.getByRole("button", { name: "Jump to Project summary" }).click();
    await askForEdits(
      page,
      "Change the investment amount to EUR 12 million and delivery year to 2031 everywhere",
    );
    const card = page.getByTestId("concept-note-document-review");
    const document = page.getByTestId("concept-note-draft-preview");
    await expectInlineReview(page, 4);
    for (const chapterId of fixture.chapter_ids.slice(0, 2)) {
      await expect(
        document
          .locator(`[data-chapter-id="${chapterId}"]`)
          .getByTestId("concept-note-inline-change"),
      ).toHaveCount(2);
    }
    await expect(card).toContainText("1 of 4");
    const proposalId = await card.getAttribute("data-proposal-id");
    await card.getByTestId("concept-note-edit-next").focus();
    await page.keyboard.press("Enter");
    await expect(card).toContainText("2 of 4");
    await expect(
      document
        .locator('[data-active-change="true"]')
        .getByTestId("concept-note-edit-proposed-text"),
    ).toHaveText("2031");
    await card.getByTestId("concept-note-edit-next").click();
    await expect(card).toContainText("3 of 4");
    expect(
      (await reviewedVersions(document.locator('[data-active-change="true"]')))
        .after,
    ).toContain("EUR 12 million");
    await expect(
      document.locator('[data-active-change="true"]'),
    ).toBeInViewport();
    await page.screenshot({
      path: test.info().outputPath("multi-location-inline-review.png"),
    });
    await card.getByTestId("concept-note-edit-options").click();
    await page.getByTestId("concept-note-edit-select-toggle").click();
    await expect(page.getByTestId("concept-note-edit-group")).toHaveCount(2);
    await page.getByTestId("concept-note-edit-group").nth(1).uncheck();
    await expect(
      page.getByTestId("concept-note-edit-apply-selected"),
    ).toHaveText("Apply selected (2)");
    await page.getByTestId("concept-note-edit-apply-selected").click();
    await expect(card).toHaveCount(0);
    const applied = await draftState(page, fixture);
    for (let index = 0; index < 2; index++) {
      expect(applied.chapters[index].body_markdown).toBe(
        before.chapters[index].body_markdown!.replace(
          "EUR 10 million",
          "EUR 12 million",
        ),
      );
      expect(applied.chapters[index].body_markdown).toContain("2030");
      expect(applied.chapters[index].status).toBe("draft");
    }
    expect(applied.chapters[2]).toEqual(before.chapters[2]);
    const persisted = await (
      await page.request.get(
        `/api/v1/concept-notes/${fixture.run_id}/edit-proposals/${proposalId}`,
      )
    ).json();
    expect(persisted.status).toBe("partially_applied");
    await page.reload();
    await expect(page.getByTestId("concept-note-draft-preview")).toContainText(
      "EUR 12 million",
    );
    expect((await draftState(page, fixture)).chapters).toEqual(
      applied.chapters,
    );
  });

  test("a stale proposal cannot overwrite a separately accepted edit", async ({
    page,
  }) => {
    const fixture = seed();
    await openWorkspace(page, fixture);
    await proposeOpening(page);
    const originalId = await page
      .getByTestId("concept-note-document-review")
      .getAttribute("data-proposal-id");
    const secondResponse = await page.request.post(
      `/api/v1/concept-notes/${fixture.run_id}/edit-proposals`,
      {
        data: {
          instruction: "Make the opening more concise",
          idempotency_key: randomUUID(),
          scope: {
            kind: "auto",
          },
        },
      },
    );
    expect(secondResponse.status()).toBe(202);
    const second = await secondResponse.json();
    const accepted = await page.request.post(
      `/api/v1/concept-notes/${fixture.run_id}/edit-proposals/${second.proposal_id}/apply`,
      {
        data: {
          idempotency_key: randomUUID(),
          expected_revisions: second.base_revisions,
        },
      },
    );
    expect(accepted.ok()).toBe(true);
    await page
      .getByTestId("concept-note-document-review")
      .getByTestId("concept-note-edit-apply-all")
      .click();
    await expect(page.getByTestId("concept-note-document-review")).toHaveCount(
      0,
    );
    const stale = await (
      await page.request.get(
        `/api/v1/concept-notes/${fixture.run_id}/edit-proposals/${originalId}`,
      )
    ).json();
    expect(stale.status).toBe("stale");
    const result = await draftState(page, fixture);
    expect(result.chapters[0].revision_number).toBe(2);
    expect(result.chapters[0].body_markdown).toContain(
      "The project will create a flood-resilient park.",
    );
  });

  test("questions do not edit, broad rewriting is automatic, and refinement retains prior intent", async ({
    page,
  }) => {
    const fixture = seed();
    await openWorkspace(page, fixture);
    const before = await draftState(page, fixture);
    await page
      .getByTestId("concept-note-chat-input")
      .fill("Why does this project improve flood resilience?");
    await page.getByTestId("concept-note-chat-send").click();
    await expect(page.getByTestId("concept-note-chat-input")).toBeEnabled();
    expect(
      (
        await (
          await page.request.get(
            `/api/v1/concept-notes/${fixture.run_id}/edit-proposals`,
          )
        ).json()
      ).length,
    ).toBe(0);
    await page
      .getByTestId("concept-note-chat-input")
      .fill("Rewrite the entire draft more concisely");
    await page.getByTestId("concept-note-chat-send").click();
    const current = page.getByTestId("concept-note-document-review");
    await expect(current).toBeVisible();
    await current.getByTestId("concept-note-edit-options").click();
    await page.getByTestId("concept-note-edit-refine-toggle").click();
    await page
      .getByTestId("concept-note-edit-refine-input")
      .fill("Make the proposed wording even shorter");
    await page.getByTestId("concept-note-edit-refine-submit").click();
    await expect(
      page.getByTestId("concept-note-edit-proposed-text").first(),
    ).toHaveText("The project will build a flood-resilient park.");
    expect((await draftState(page, fixture)).chapters).toEqual(before.chapters);
  });

  test("chat and document panes scroll independently with keyboard-accessible edit navigation", async ({
    page,
  }) => {
    const fixture = seed();
    await openWorkspace(page, fixture);
    for (let index = 0; index < 3; index++) {
      await page
        .getByTestId("concept-note-chat-input")
        .fill(`Why does flood resilience matter? Question ${index + 1}`);
      await page.getByTestId("concept-note-chat-send").click();
      await expect(
        page.getByText(
          "This synthetic concept note describes a flood-resilient park. No document changes were made.",
          { exact: true },
        ),
      ).toHaveCount(index + 1);
      await expect(page.getByTestId("concept-note-chat-input")).toBeEnabled();
    }
    await askForEdits(
      page,
      "Change the investment amount to EUR 12 million and delivery year to 2031 everywhere",
    );
    const chat = page.getByTestId("concept-note-chat-scroll");
    const document = page.getByTestId("concept-note-draft-preview");
    const documentBefore = await document.evaluate(
      (element) => element.scrollTop,
    );
    const chatBefore = await chat.evaluate((element) => element.scrollTop);
    await chat.hover();
    await page.mouse.wheel(0, 100);
    await expect
      .poll(() => chat.evaluate((element) => element.scrollTop))
      .not.toBe(chatBefore);
    expect(await document.evaluate((element) => element.scrollTop)).toBe(
      documentBefore,
    );
    const chatAfter = await chat.evaluate((element) => element.scrollTop);
    await document.hover();
    await page.mouse.wheel(0, 100);
    await expect
      .poll(() => document.evaluate((element) => element.scrollTop))
      .not.toBe(documentBefore);
    expect(await chat.evaluate((element) => element.scrollTop)).toBe(chatAfter);
    const next = page.getByTestId("concept-note-edit-next").first();
    await next.focus();
    await expect(next).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(
      page.getByTestId("concept-note-document-review"),
    ).toContainText("2 of 4");
  });

  test("review controls share the Export header and stay reachable at narrow widths", async ({
    page,
  }) => {
    const fixture = seed();
    await openWorkspace(page, fixture);
    await proposeOpening(page);
    const header = page.getByTestId("concept-note-document-header");
    const accept = header.getByTestId("concept-note-edit-apply-all");
    const exportButton = header.getByTestId("concept-note-export");
    const acceptBox = await accept.boundingBox();
    const exportBox = await exportButton.boundingBox();
    expect(Math.abs(acceptBox!.y - exportBox!.y)).toBeLessThanOrEqual(2);
    await page.screenshot({
      path: test.info().outputPath("compact-desktop.png"),
    });
    await page.getByRole("tab", { name: "Structure", exact: true }).click();
    await expect(header.getByTestId("concept-note-edit-apply-all")).toHaveCount(
      0,
    );
    await header.getByTestId("concept-note-review-return-to-draft").click();
    await expect(accept).toBeVisible();
    await page.setViewportSize({ width: 375, height: 812 });
    await header.scrollIntoViewIfNeeded();
    for (const control of [
      accept,
      header.getByTestId("concept-note-edit-reject-all"),
      exportButton,
    ]) {
      await expect(control).toBeInViewport();
      const box = await control.boundingBox();
      expect(box!.x).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width).toBeLessThanOrEqual(375);
    }
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: test.info().outputPath("compact-mobile.png"),
    });
    expect((await draftState(page, fixture)).chapters[0].revision_number).toBe(
      1,
    );
  });
});
