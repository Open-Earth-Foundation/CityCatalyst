import { test } from "@e2e-dev/web";
import type { WebRoute } from "@e2e-dev/web";
import { expect, type JsonValue } from "e2e";

import { ADMIN_SESSION } from "./support/citycatalyst.ts";

// Agentic port of e2e/concept-note-funding.spec.ts. The API responses stay
// deterministic (same mocks as the Playwright contract test); the agent does the
// browsing and selecting that timed out on `locator.click` in CI, and every
// saved selection is checked on the request the app sent.
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

type SavedSelection = {
  funder_id: string | null;
  selected_funding_opportunity_id: string | null;
  expected_funder_id?: string | null;
  expected_funding_opportunity_id?: string | null;
};

/** Serves the concept-note API from fixtures and records every saved selection. */
function conceptNoteApi(saved: SavedSelection[]) {
  let selectedFunder: (typeof funders)[number] | undefined;
  let selectedOpportunity: typeof opportunity | undefined;

  return async (route: WebRoute) => {
    const url = new URL(route.request.url);
    const path = `${url.pathname.replace(/\/$/, "")}/`;
    // Fixture objects have no index signature, so they need the JsonValue cast.
    const json = (body: unknown) => route.fulfill({ json: body as JsonValue });

    if (path === "/api/v1/user/access-status/")
      return json({
        data: {
          isOrgOwner: false,
          isProjectAdmin: false,
          isCollaborator: true,
          organizationId: "test-organization",
        },
      });
    if (path === "/api/v1/user/")
      return json({
        data: {
          userId: "owner",
          name: "Funding reviewer",
          preferredLanguage: "en",
          role: "user",
        },
      });
    if (path === `/api/v1/city/${cityId}/`)
      return json({ data: { cityId, name: "Krakow", country: "Poland" } });
    if (path === `/api/v1/city/${cityId}/dashboard/`)
      return json({
        data: {
          city: { cityId, name: "Krakow", country: "Poland" },
          inventories: [],
          population: null,
          organization: null,
          widgets: { ghgi: null, hiap: null, ccra: null },
        },
      });
    if (path === `/api/v1/city/${cityId}/years/`)
      return json({ data: { city: { cityId }, years: [] } });
    if (path === "/api/v1/user/projects/") return json([]);
    if (path.includes("/modules/") && path.endsWith("/access/"))
      return json({ data: { hasAccess: true } });
    if (!path.includes(`/concept-notes/${runId}`)) return json({ data: [] });
    if (path.endsWith("/context-bundle/refresh/"))
      return json({ run_id: runId, status: "current" });
    if (path.endsWith("/structure/"))
      return json({ fingerprint: "a".repeat(64), chapters: [] });
    if (path.endsWith("/funding-catalogue/")) return json({ funders });
    if (path.endsWith("/application-context/")) {
      if (route.request.method === "PATCH") {
        const body = JSON.parse(
          route.request.postData ?? "{}",
        ) as SavedSelection;
        saved.push(body);
        selectedFunder = funders.find((f) => f.id === body.funder_id);
        selectedOpportunity = selectedFunder?.opportunities.find(
          (o) => o.id === body.selected_funding_opportunity_id,
        );
      }
      return json({
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
      });
    }
    if (path.endsWith("/draft/"))
      return json({
        run_id: runId,
        status: "not_started",
        chapters: [],
        completed_chapters: 0,
        total_chapters: 0,
      });
    if (path.includes("/edit-proposals")) return json([]);
    if (path.endsWith(`/${runId}/`))
      return json({
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
      });
    return route.continue();
  };
}

test(
  "Concept note funding: browse, select, reload, switch and clear funding",
  { session: ADMIN_SESSION },
  async ({ app, agent, screen, browser }) => {
    const saved: SavedSelection[] = [];
    await browser.route("**/api/v1/**", conceptNoteApi(saved));

    await app.open(`/en/cities/${cityId}/concept-notes/${runId}/`);
    await screen.getByRole("tab", "Context").tap();

    await agent.act("Browse funders and search the funders for transport");
    const dialog = screen.getByRole("dialog");
    await expect(dialog.getByText("1 of 2 funders")).toBeVisible();

    await agent.act(
      "Open the details of European Climate Fund in the funder list. Stop there: do not save or change the selection",
    );
    await expect(
      dialog.getByText("Climate resilience and low-carbon transport"),
    ).toBeVisible();
    await expect(
      dialog.getByRole("button", { name: /Green Cities Programme/ }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(dialog.getByText("Project summary")).toBeVisible();
    await expect(dialog.getByText("Total budget")).toBeVisible();

    // A first save with a drafting template moves on to the Draft tab.
    await agent.act("Save the selection and go to drafting");
    await expect(screen.getByRole("tab", "Draft preview")).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(saved[0]).toMatchObject({
      funder_id: funderId,
      selected_funding_opportunity_id: opportunityId,
    });

    await browser.reload();
    await screen.getByRole("tab", "Context").tap();
    await expect(screen.getByText("European Climate Fund")).toBeVisible();

    await agent.act(
      "Change the selected funder to Global Adaptation Foundation and save the selection",
    );
    await expect(
      screen.getByText("Global Adaptation Foundation"),
    ).toBeVisible();
    expect(saved[1]).toMatchObject({
      funder_id: otherFunderId,
      selected_funding_opportunity_id: null,
      expected_funder_id: funderId,
      expected_funding_opportunity_id: opportunityId,
    });

    await agent.act("Clear the funder selection and save it");
    await expect(screen.getByText("No funder selected")).toBeVisible();
    expect(saved[2]).toMatchObject({ funder_id: null });

    // The dialog stays usable on a phone-sized viewport.
    await browser.setViewport({ width: 390, height: 844 });
    await agent.act(
      "Browse funders and open the details of European Climate Fund. Stop there: do not save",
    );
    await expect(
      dialog.getByRole("button", "Save and go to drafting"),
    ).toBeVisible();
    expect(
      await browser.evaluate(() => {
        const element = document.querySelector('[role="dialog"]');
        return element !== null && element.scrollWidth <= element.clientWidth;
      }),
    ).toBe(true);
  },
);
