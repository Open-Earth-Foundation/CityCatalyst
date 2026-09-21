import { expect, test } from "@playwright/test";

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

test("browse, inspect, select, reload, switch and clear funding", async ({
  page,
}) => {
  let selectedFunder: (typeof funders)[number] | undefined;
  let selectedOpportunity: typeof opportunity | undefined;
  const saved: unknown[] = [];
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
    if (url.pathname === "/api/v1/user/projects/")
      return route.fulfill({ json: [] });
    if (url.pathname.includes("/modules/") && url.pathname.endsWith("/access/"))
      return route.fulfill({ json: { data: { hasAccess: true } } });
    if (!url.pathname.includes(`/concept-notes/${runId}`))
      return route.fulfill({ json: { data: [] } });
    if (url.pathname.endsWith("/funding-catalogue/"))
      return route.fulfill({ json: { funders } });
    if (url.pathname.endsWith("/application-context/")) {
      if (route.request().method() === "PATCH") {
        const body = route.request().postDataJSON();
        saved.push(body);
        selectedFunder = funders.find((f) => f.id === body.funder_id);
        selectedOpportunity = selectedFunder?.opportunities.find(
          (o) => o.id === body.selected_funding_opportunity_id,
        ) as typeof opportunity | undefined;
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
  await clickDialogButton(/Green Cities Programme/);
  await expect(
    dialog.getByText("Project summary", { exact: true }),
  ).toBeVisible();
  await expect(dialog.getByText("Total budget", { exact: true })).toBeVisible();
  await expect(
    dialog.getByText("Municipal governments", { exact: true }),
  ).toBeVisible();
  await clickDialogButton("Save selection");
  await expect(dialog).not.toBeVisible();
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
  await clickDialogButton(/Green Cities Programme/);
  await expect(
    dialog.getByRole("button", { name: "Save selection", exact: true }),
  ).toBeVisible();
  expect(
    await dialog.evaluate(
      (element) => element.scrollWidth <= element.clientWidth,
    ),
  ).toBe(true);
  await page.keyboard.press("Escape");
  await expect(dialog).not.toBeVisible();
});
