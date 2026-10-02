import { describe, test } from "@e2e-dev/web";
import { expect } from "e2e";
import { z } from "zod";

import { ADMIN_SESSION, CityCatalystApi } from "./support/citycatalyst.ts";

// Agentic port of e2e/report-results.spec.ts. The Playwright version fought the
// activity modal (unlabelled amount input, building-type conflicts, menu
// clicks) and its results check is skipped (CC-583). Here the agent fills the
// modal; the saved rows and the results totals are checked deterministically
// and through the results API.

// Custom EF CO2=10, N2O=10, CH4=1 on amount 100 with AR6 (CH4 27.9, N2O 273):
// 100 x (10 + 27.9 + 2730) = 276,790 kgCO2e = 276.79 tCO2e per activity.
const EXPECTED_TCO2E_PER_ACTIVITY = 276.79;
const EMISSION_FACTORS =
  "choose custom emission factors: CO2 10, N2O 10, CH4 1; data quality High; data source 'test'; explanatory comments 'test'";

type TopEmissionRow = {
  subsectorName: string;
  scopeName: string;
  co2eq: string;
  percentage: number | null;
};

let inventory: { cityId: string; inventoryId: string } | undefined;
let api: CityCatalystApi | undefined;

describe("Report Results", { serial: true, session: ADMIN_SESSION }, () => {
  test("user enters scope 1 residential emissions data", async ({
    app,
    agent,
    screen,
    browser,
  }) => {
    await app.open("/en/cities/");
    api = await CityCatalystApi.fromBrowser(app.baseUrl!, browser);
    inventory = await api.createChicagoInventory();
    const { cityId, inventoryId } = inventory;

    await app.open(`/en/cities/${cityId}/GHGI/${inventoryId}/data/1/`);
    await agent.act(
      "Open the Residential buildings subsector, go to the Scope 1 tab, pick the Fuel Consumption methodology if asked, and open the form to add an activity",
    );
    await expect(screen.getByTestId("add-emission-modal")).toBeVisible();

    await agent.act(
      `In the add activity form enter building type All, fuel type Propane, total fuel consumption 100 in cubic meters, ${EMISSION_FACTORS}. Then save the activity`,
    );
    await expect(screen.getByTestId("add-emission-modal")).toBeHidden();
    await expect(
      screen
        .getByRole("tabpanel")
        .getByText(/Propane/)
        .first(),
    ).toBeVisible();
  });

  test("user enters scope 2 residential emissions data", async ({
    app,
    agent,
    screen,
  }) => {
    const { cityId, inventoryId } = inventory!;

    await app.open(`/en/cities/${cityId}/GHGI/${inventoryId}/data/1/`);
    await agent.act(
      "Open the Residential buildings subsector, go to the Scope 2 tab, pick the Energy Consumption methodology if asked, and open the form to add an activity",
    );
    await expect(screen.getByTestId("add-emission-modal")).toBeVisible();

    await agent.act(
      `In the add activity form enter building type Single family home, energy usage type Electricity, energy consumption 100 in kilowatt hours (kWh), ${EMISSION_FACTORS}. Then save the activity`,
    );
    await expect(screen.getByTestId("add-emission-modal")).toBeHidden();
    await expect(
      screen
        .getByRole("tabpanel")
        .getByText(/Electricity/)
        .first(),
    ).toBeVisible();
  });

  test("user sees both residential activities in the inventory results", async ({
    app,
    agent,
    screen,
  }) => {
    const { cityId, inventoryId } = inventory!;

    // Results are aggregated asynchronously after an activity is saved.
    const residentialRows = async () => {
      const results = await api!.request<{
        data: { topEmissions: { bySubSector: TopEmissionRow[] } };
      }>("GET", `/inventory/${inventoryId}/results`);
      return results.data.topEmissions.bySubSector.filter((row) =>
        /residential/i.test(row.subsectorName),
      );
    };
    await expect
      .poll(async () => (await residentialRows()).length, { timeout: 60_000 })
      .toBe(2);
    for (const row of await residentialRows()) {
      expect(Number(row.co2eq) / 1000).toBeCloseTo(
        EXPECTED_TCO2E_PER_ACTIVITY,
        2,
      );
    }

    await app.open(`/en/cities/${cityId}/GHGI/${inventoryId}/`);
    await screen.getByTestId("tab-emission-inventory-results-title").tap();
    // The results tab mounts its heading first and loads the table after.
    await expect(
      screen.getByText(/Total emissions \(CO2eq\)/i).first(),
    ).toBeVisible({ timeout: 60_000 });

    const table = await agent.extract(
      "every row of the Top Emissions table: subsector, scope, the total emissions number and its unit exactly as displayed (no unit conversion), and the percentage of emissions",
      {
        schema: z.object({
          rows: z.array(
            z.object({
              subsector: z.string(),
              scope: z.string(),
              emissions: z.number(),
              emissionsUnit: z.string(),
              percentage: z.number(),
            }),
          ),
        }),
      },
    );
    const residential = table.rows.filter((row) =>
      /residential/i.test(row.subsector),
    );
    expect(residential).toHaveLength(2);
    for (const row of residential) {
      // The table shows metric tonnes, e.g. "276.79 mtCO₂e".
      expect(row.emissions).toBeCloseTo(EXPECTED_TCO2E_PER_ACTIVITY, 2);
      expect(row.emissionsUnit).toMatch(/^mtCO(2|₂)e$/i);
    }
    expect(
      residential.reduce((sum, row) => sum + row.percentage, 0),
    ).toBeCloseTo(100, 0);
  });
});
