import { expect, test, type Page, type Route } from "@playwright/test";
import type { CityDashboardResponse } from "@/util/types";
import { skipCookieConsent } from "./helpers";

test.beforeEach(({ context }) => skipCookieConsent(context));

// Browser contract tests use real components and RTK requests with deterministic
// responses. Database persistence and authorization are covered by service/API tests.
const cityId = "f8063baa-e795-4ffb-a507-7a2ea6090eae";
const runId = "e7cca88d-de54-4050-88ed-d6b39790853b";
const funderId = "10000000-0000-4000-8000-000000000001";
const otherFunderId = "10000000-0000-4000-8000-000000000002";
const opportunityId = "20000000-0000-4000-8000-000000000001";
const template = {
  id: "30000000-0000-4000-8000-000000000001",
  name: "Urban resilience application",
  output_format: "docx",
  chapter_schema: [
    {
      chapter_ref: "summary",
      title: "Project summary",
      description:
        "Describe the climate problem and the proposed intervention.",
      required: true,
    },
    {
      chapter_ref: "budget",
      title: "Budget and financing",
      description: "State the total cost, requested award and co-financing.",
      required: true,
    },
  ],
  required_fields: ["total_budget", "project_location"],
};
const opportunity = {
  id: opportunityId,
  name: "Green Cities Programme",
  applicant_type: "Municipal governments",
  category: "Infrastructure",
  sector: "Transport",
  region_scope: "Europe",
  finance_route: "Project finance",
  instrument_type: "Grant",
  min_award: "100000",
  max_award: "2000000",
  currency: "EUR",
  status: "Open",
  summary:
    "Supports cities developing low-carbon transport and resilient public infrastructure.",
  hazards: [],
  interventions: ["Public transport"],
  known_gaps: ["Confirm the current application deadline."],
  template,
};
const funders = [
  {
    id: funderId,
    name: "European Climate Fund",
    funder_type: "Public institution",
    country: "Poland",
    region: "Europe",
    profile: {
      stated: {
        priorities: "Climate resilience and low-carbon transport",
        eligibility: "Cities and municipal authorities",
      },
      derived: { typical_projects: "Urban infrastructure" },
    },
    opportunities: [opportunity],
  },
  {
    id: otherFunderId,
    name: "Global Adaptation Foundation",
    funder_type: "Foundation",
    country: null,
    region: "Global",
    profile: {},
    opportunities: [],
  },
];

interface CatalogueFunder {
  id: string;
  name: string;
  opportunities: Array<{ id: string; name: string; template: unknown }>;
}

interface WorkspaceMockOptions {
  /** Current catalogue; tests that add a funder mutate their own copy. */
  catalogue?: () => CatalogueFunder[];
  /** Extra concept-note routes; return true once the route is fulfilled. */
  extra?: (route: Route, url: URL) => Promise<boolean>;
}

/** Deterministic responses for the workspace, catalogue and funding save. */
async function mockWorkspace(
  page: Page,
  { catalogue = () => funders, extra }: WorkspaceMockOptions = {},
): Promise<{ saved: Array<Record<string, unknown>> }> {
  let selectedFunder: CatalogueFunder | undefined;
  let selectedOpportunity: CatalogueFunder["opportunities"][number] | undefined;
  const saved: Array<Record<string, unknown>> = [];
  await page.route("**/api/v1/**", async (route) => {
    const url = new URL(route.request().url());
    url.pathname = `${url.pathname.replace(/\/$/, "")}/`;
    if (url.pathname === "/api/v1/user/access-status/")
      return route.fulfill({
        json: {
          data: {
            isOrgOwner: false,
            isProjectAdmin: false,
            isCollaborator: true,
            organizationId: "test-organization",
          },
        },
      });
    if (url.pathname === "/api/v1/user/")
      return route.fulfill({
        json: {
          data: {
            userId: "owner",
            name: "Funding reviewer",
            preferredLanguage: "en",
            role: "user",
          },
        },
      });
    if (url.pathname === `/api/v1/city/${cityId}/`)
      return route.fulfill({
        json: { data: { cityId, name: "Krakow", country: "Poland" } },
      });
    if (url.pathname === `/api/v1/city/${cityId}/dashboard/`)
      return route.fulfill({
        json: {
          data: {
            city: { cityId, name: "Krakow", country: "Poland" },
            inventories: [],
            population: null,
            organization: null,
            widgets: { ghgi: null, hiap: null, ccra: null },
          } satisfies CityDashboardResponse,
        },
      });
    if (url.pathname === `/api/v1/city/${cityId}/years/`)
      return route.fulfill({ json: { data: { city: { cityId }, years: [] } } });
    if (url.pathname === "/api/v1/user/projects/")
      return route.fulfill({ json: [] });
    if (url.pathname.includes("/modules/") && url.pathname.endsWith("/access/"))
      return route.fulfill({ json: { data: { hasAccess: true } } });
    if (!url.pathname.includes(`/concept-notes/${runId}`))
      return route.fulfill({ json: { data: [] } });
    if (extra && (await extra(route, url))) return;
    if (url.pathname.endsWith("/funder-imports/current/"))
      return route.fulfill({ json: { funder_import: null } });
    if (url.pathname.endsWith("/context-bundle/refresh/"))
      return route.fulfill({ json: { run_id: runId, status: "current" } });
    if (url.pathname.endsWith("/structure/"))
      return route.fulfill({
        json: { fingerprint: "a".repeat(64), chapters: [] },
      });
    if (url.pathname.endsWith("/funding-catalogue/"))
      return route.fulfill({ json: { funders: catalogue() } });
    if (url.pathname.endsWith("/application-context/")) {
      if (route.request().method() === "PATCH") {
        const body = route.request().postDataJSON();
        saved.push(body);
        selectedFunder = catalogue().find((f) => f.id === body.funder_id);
        selectedOpportunity = selectedFunder?.opportunities.find(
          (o) => o.id === body.selected_funding_opportunity_id,
        );
      }
      return route.fulfill({
        json: {
          run_id: runId,
          city_id: cityId,
          funder: selectedFunder
            ? { id: selectedFunder.id, name: selectedFunder.name }
            : null,
          opportunity: selectedOpportunity
            ? { id: selectedOpportunity.id, name: selectedOpportunity.name }
            : null,
          template: selectedOpportunity?.template ?? null,
          included_sources: {
            city: true,
            project: false,
            ghgi: true,
            ccra: false,
            hiap: false,
          },
        },
      });
    }
    if (url.pathname.endsWith("/draft/"))
      return route.fulfill({
        json: {
          run_id: runId,
          status: "not_started",
          chapters: [],
          completed_chapters: 0,
          total_chapters: 0,
        },
      });
    if (url.pathname.includes("/edit-proposals"))
      return route.fulfill({ json: [] });
    if (url.pathname.endsWith(`/${runId}/`))
      return route.fulfill({
        json: {
          run_id: runId,
          city_id: cityId,
          user_id: "owner",
          name: "Krakow · Transport resilience",
          status: "active",
          workflow_step: "assembling_context",
          thread_id: null,
          uploads: [],
          progress_summary: {
            context_bundle: { status: "ready", ready_sources: 1 },
          },
        },
      });
    return route.continue();
  });
  return { saved };
}

async function openFundingDialog(page: Page) {
  await page.goto(`/en/cities/${cityId}/concept-notes/${runId}/`);
  await page.getByRole("tab", { name: "Context", exact: true }).click();
  await page
    .getByRole("button", { name: "Browse funders", exact: true })
    .click();
  return page.getByRole("dialog");
}

test("browse, inspect, select, reload, switch and clear funding", async ({
  page,
}) => {
  const { saved } = await mockWorkspace(page);

  await page.goto(`/en/cities/${cityId}/concept-notes/${runId}/`);
  await page.getByRole("tab", { name: "Context", exact: true }).click();
  await page
    .getByRole("button", { name: "Browse funders", exact: true })
    .click();
  const dialog = page.getByRole("dialog");
  const clickDialogButton = (name: string | RegExp) =>
    dialog.getByRole("button", { name, exact: true }).click();
  const search = dialog.getByLabel("Search all funders", { exact: true });
  await expect(search).toBeFocused();
  await expect(dialog.getByText("2 of 2 funders")).toBeVisible();
  await search.fill("no such funding");
  await expect(
    dialog.getByText("No funders match your search.", { exact: false }),
  ).toBeVisible();
  await search.fill("transport");
  await expect(dialog.getByText("1 of 2 funders")).toBeVisible();
  await clickDialogButton(/European Climate Fund/);
  await expect(
    dialog.getByText("Climate resilience and low-carbon transport", {
      exact: true,
    }),
  ).toBeVisible();
  const programme = dialog.getByRole("button", {
    name: /Green Cities Programme/,
  });
  // A funder's only programme is preselected and can still be deselected.
  await expect(programme).toHaveAttribute("aria-pressed", "true");
  await programme.click();
  await expect(programme).toHaveAttribute("aria-pressed", "false");
  await programme.click();
  await expect(programme).toHaveAttribute("aria-pressed", "true");
  await expect(
    dialog.getByText("Project summary", { exact: true }),
  ).toBeVisible();
  await expect(dialog.getByText("Total budget", { exact: true })).toBeVisible();
  await expect(
    dialog.getByText("Municipal governments", { exact: true }),
  ).toBeVisible();
  // A first save with a drafting template moves on to the Draft tab.
  await clickDialogButton("Save and go to drafting");
  await expect(dialog).not.toBeVisible();
  await expect(
    page.getByRole("tab", { name: "Draft preview", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await page.getByRole("tab", { name: "Context", exact: true }).click();
  await expect(
    page.getByText("European Climate Fund", { exact: true }),
  ).toBeVisible();
  expect(saved[0]).toMatchObject({
    funder_id: funderId,
    selected_funding_opportunity_id: opportunityId,
  });

  await page.reload();
  await page.getByRole("tab", { name: "Context", exact: true }).click();
  await expect(
    page.getByText("European Climate Fund", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Change", exact: true }).click();
  await clickDialogButton(/Global Adaptation Foundation/);
  await expect(
    dialog.getByText("No programmes are available", { exact: false }),
  ).toBeVisible();
  await expect(
    dialog.getByText("Budget and financing", { exact: true }),
  ).not.toBeVisible();
  await clickDialogButton("Save selection");
  expect(saved[1]).toMatchObject({
    funder_id: otherFunderId,
    selected_funding_opportunity_id: null,
    expected_funder_id: funderId,
    expected_funding_opportunity_id: opportunityId,
  });
  await page.getByRole("button", { name: "Change", exact: true }).click();
  await clickDialogButton("Clear selection");
  await clickDialogButton("Save selection");
  await expect(
    page.getByText("No funder selected", { exact: true }),
  ).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });
  await page
    .getByRole("button", { name: "Browse funders", exact: true })
    .click();
  await clickDialogButton(/European Climate Fund/);
  await expect(programme).toHaveAttribute("aria-pressed", "true");
  await expect(
    dialog.getByRole("button", {
      name: "Save and go to drafting",
      exact: true,
    }),
  ).toBeVisible();
  expect(
    await dialog.evaluate(
      (element) => element.scrollWidth <= element.clientWidth,
    ),
  ).toBe(true);
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
});

const addedFunderId = "10000000-0000-4000-8000-000000000099";
const addedOpportunityId = "20000000-0000-4000-8000-000000000099";
const uploadId = "40000000-0000-4000-8000-000000000001";
const importId = "50000000-0000-4000-8000-000000000001";

/** The catalogue row the server returns once the reviewed funder is added. */
function addedFunder(
  body: {
    funder: { name: string; funder_type: string | null };
    opportunity: { name: string };
    template: {
      template_name: string;
      chapter_schema: Array<{ title: string }>;
    };
  },
  addedFrom: { kind: "document" | "manual"; filename: string | null },
): CatalogueFunder {
  return {
    ...funders[1]!,
    id: addedFunderId,
    name: body.funder.name,
    funder_type: body.funder.funder_type,
    opportunities: [
      {
        ...opportunity,
        id: addedOpportunityId,
        name: body.opportunity.name,
        added_from: addedFrom,
        template: {
          ...template,
          id: "30000000-0000-4000-8000-000000000099",
          name: body.template.template_name,
          chapter_schema: body.template.chapter_schema.map((chapter, i) => ({
            chapter_ref: `chapter_${i + 1}`,
            title: chapter.title,
            description: null,
            required: true,
          })),
          required_fields: [],
        },
      },
    ],
  } as unknown as CatalogueFunder;
}

test("add a funder by hand and select it", async ({ page }) => {
  const catalogue: CatalogueFunder[] = [...funders];
  const created: Array<Record<string, unknown>> = [];
  const { saved } = await mockWorkspace(page, {
    catalogue: () => catalogue,
    extra: async (route, url) => {
      if (!url.pathname.endsWith("/funders/")) return false;
      const body = route.request().postDataJSON();
      created.push(body);
      catalogue.push(addedFunder(body, { kind: "manual", filename: null }));
      await route.fulfill({
        status: 201,
        json: {
          funder_id: addedFunderId,
          funding_opportunity_id: addedOpportunityId,
        },
      });
      return true;
    },
  });
  const dialog = await openFundingDialog(page);
  // The entry point stays visible when a search finds nothing.
  await dialog
    .getByLabel("Search all funders", { exact: true })
    .fill("Resilient Futures");
  await dialog
    .getByRole("button", { name: /Add a funder that isn't listed/ })
    .click();
  await dialog.getByRole("button", { name: "Enter details by hand" }).click();

  const add = dialog.getByRole("button", { name: "Add funder", exact: true });
  await dialog.getByLabel("Funder name").fill("Resilient Futures Fund");
  await dialog.getByLabel("Programme name").fill("Resilient Cities 2027");
  // A missing required field explains why the funder cannot be added yet.
  await add.click();
  await expect(
    dialog.getByText("Add a template name so drafting knows", { exact: false }),
  ).toBeVisible();
  expect(created).toHaveLength(0);
  await dialog.getByLabel("Template name").fill("Concept note");
  await dialog.getByLabel("Chapter 1 title").fill("Project summary");
  await dialog.getByLabel("Hazards").fill("Flooding, Heat");
  await add.click();

  expect(created[0]).toMatchObject({
    import_id: null,
    funder: { name: "Resilient Futures Fund" },
    opportunity: {
      name: "Resilient Cities 2027",
      min_award: null,
      hazards: ["Flooding", "Heat"],
    },
    template: {
      template_name: "Concept note",
      chapter_schema: [{ chapter_ref: "", title: "Project summary" }],
    },
  });
  await expect(
    dialog.getByRole("button", { name: /Resilient Futures Fund/ }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    dialog.getByText("Added by hand", { exact: true }),
  ).toBeVisible();
  await expect(
    dialog.getByText("Funder added. Save the selection", { exact: false }),
  ).toBeVisible();
  await dialog
    .getByRole("button", { name: "Save and go to drafting", exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  expect(saved[0]).toMatchObject({
    funder_id: addedFunderId,
    selected_funding_opportunity_id: addedOpportunityId,
  });
});

test("read a funder document, review it and add the funder", async ({
  page,
}) => {
  const catalogue: CatalogueFunder[] = [...funders];
  const filename = "Green_Cities_Call_2026.pdf";
  const created: Array<Record<string, unknown>> = [];
  let importPolls = 0;
  let funderImport: Record<string, unknown> | null = null;
  const draft = {
    funder: {
      name: "Green Cities Foundation",
      funder_type: "Private foundation",
      country: "United States",
      region: null,
      profile: {
        stated: { purpose: "Helps cities reduce climate risk." },
        derived: {},
      },
    },
    opportunity: {
      name: "Nature-Based Cities Call 2026",
      applicant_type: "Municipal governments",
      category: null,
      sector: "Biodiversity",
      hazards: ["Flooding"],
      interventions: [],
      finance_route: null,
      instrument_type: "Grant",
      region_scope: "Latin America",
      min_award: 150000,
      max_award: 600000,
      currency: "USD",
      status: "Open",
      summary: null,
      known_gaps: ["Co-financing share is not quantified."],
    },
    template: {
      template_name: "Proposal form",
      output_format: "docx",
      chapter_schema: [
        {
          chapter_ref: "applicant_details",
          title: "Applicant details",
          description: null,
          required: true,
          required_fields: [],
        },
      ],
    },
    evidence: [
      {
        field: "funder.name",
        quote: "The Green Cities Foundation invites",
        page: 1,
      },
      {
        field: "opportunity.name",
        quote: "Nature-Based Cities Call 2026",
        page: 1,
      },
    ],
    missing: ["funder.region", "opportunity.category"],
  };
  const { saved } = await mockWorkspace(page, {
    catalogue: () => catalogue,
    extra: async (route, url) => {
      const method = route.request().method();
      if (url.pathname.endsWith("/uploads/") && method === "POST") {
        await route.fulfill({
          status: 202,
          json: {
            uploadId,
            status: "processing",
            stage: "ocr",
            canRetry: false,
            filename,
          },
        });
        return true;
      }
      if (url.pathname.endsWith("/funder-imports/") && method === "POST") {
        expect(route.request().postDataJSON()).toEqual({ uploadId });
        funderImport = {
          import_id: importId,
          upload_id: uploadId,
          filename,
          status: "processing",
          error_code: null,
          draft: null,
          created_at: "2026-09-28T10:00:00Z",
          updated_at: "2026-09-28T10:00:00Z",
        };
        await route.fulfill({
          status: 202,
          json: { funder_import: funderImport },
        });
        return true;
      }
      if (url.pathname.endsWith("/funder-imports/current/")) {
        if (funderImport?.status === "processing") {
          importPolls += 1;
          // Stay "processing" across closing and reopening the dialog.
          if (importPolls > 3) {
            funderImport = { ...funderImport, status: "ready", draft };
          }
        }
        await route.fulfill({ json: { funder_import: funderImport } });
        return true;
      }
      if (url.pathname.endsWith("/funders/")) {
        const body = route.request().postDataJSON();
        created.push(body);
        catalogue.push(addedFunder(body, { kind: "document", filename }));
        funderImport = null;
        await route.fulfill({
          status: 201,
          json: {
            funder_id: addedFunderId,
            funding_opportunity_id: addedOpportunityId,
          },
        });
        return true;
      }
      return false;
    },
  });
  const dialog = await openFundingDialog(page);
  await dialog
    .getByRole("button", { name: /Add a funder that isn't listed/ })
    .click();
  await dialog.locator('input[type="file"]').setInputFiles({
    name: filename,
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.4\n% funder call\n"),
  });
  const status = dialog.getByTestId("funder-import-status");
  await expect(status).toContainText(filename);
  await expect(status).toContainText("Reading funder details");

  // Closing the dialog does not stop the read; reopening shows its state.
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
  await page
    .getByRole("button", { name: "Browse funders", exact: true })
    .click();
  const entry = dialog.getByRole("button", {
    name: /Add a funder that isn't listed/,
  });
  // The mock finishes the read after a few 2-second polls.
  await expect(entry).toContainText("Ready to review", { timeout: 15000 });
  await entry.click();
  await dialog
    .getByRole("button", { name: "Review details", exact: true })
    .click();

  await expect(
    dialog.getByRole("heading", { name: "Review funder details" }),
  ).toBeVisible();
  await expect(dialog.getByLabel("Funder name")).toHaveValue(
    "Green Cities Foundation",
  );
  await expect(dialog.getByLabel("Minimum award")).toHaveValue("150000");
  await expect(
    dialog.getByText("2 details weren't in the document", { exact: false }),
  ).toBeVisible();
  await dialog
    .getByLabel("Programme name")
    .fill("Nature-Based Cities Call 2026 (Round 2)");
  await dialog.getByRole("button", { name: "Add funder", exact: true }).click();

  expect(created[0]).toMatchObject({
    import_id: importId,
    funder: {
      name: "Green Cities Foundation",
      region: null,
      profile: { stated: { purpose: "Helps cities reduce climate risk." } },
    },
    opportunity: {
      name: "Nature-Based Cities Call 2026 (Round 2)",
      min_award: 150000,
      max_award: 600000,
      hazards: ["Flooding"],
      known_gaps: ["Co-financing share is not quantified."],
    },
    template: { template_name: "Proposal form" },
  });
  await expect(
    dialog.getByText(`Added from ${filename}`, { exact: true }),
  ).toBeVisible();
  await expect(
    dialog.getByRole("button", { name: /Green Cities Foundation/ }),
  ).toHaveAttribute("aria-pressed", "true");
  await dialog
    .getByRole("button", { name: "Save and go to drafting", exact: true })
    .click();
  await expect(dialog).not.toBeVisible();
  expect(saved[0]).toMatchObject({
    funder_id: addedFunderId,
    selected_funding_opportunity_id: addedOpportunityId,
  });
});
