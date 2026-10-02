import { test } from "@e2e-dev/web";
import { expect } from "e2e";

import { ADMIN_SESSION, inventoryYear } from "./support/citycatalyst.ts";

// Agentic port of e2e/dashboard.spec.ts. The Playwright version walks both
// onboarding wizards with fixed sleeps and URL waits, and timed out in CI on
// `waitForURL`. Here the agent drives the wizards; every hand-off between
// steps and the final dashboard are checked deterministically.
test(
  "Dashboard: user can complete onboarding and access the dashboard",
  { session: ADMIN_SESSION },
  async ({ app, agent, screen, browser }) => {
    const year = String(inventoryYear());

    await app.open("/en/cities/onboarding/");
    await agent.act(
      "Start the city setup and select the city Chicago in United States of America > Illinois, then continue",
    );
    await expect(screen.getByTestId("invite-collaborators-step")).toBeVisible();

    await agent.act("Skip inviting collaborators");
    await expect(browser).toHaveURL(/\/cities\/onboarding\/done/);
    const cityId = new URL(await browser.url()).searchParams.get("cityId");
    expect(cityId).toBeTruthy();

    await app.open(`/en/cities/${cityId}/GHGI/onboarding`);
    await agent.act(
      "Create a new inventory for the year {year} with the GPC Basic inventory goal and the AR6 global warming potential, then continue",
      { params: { year } },
    );
    await expect(
      screen.getByTestId("add-population-data-heading"),
    ).toBeVisible();

    await agent.act(
      "Make sure city, region and country population are filled in for {year} (use 2700000, 12500000 and 335000000 for any that are empty), then continue",
      { params: { year } },
    );
    await expect(screen.getByTestId("third-party-data-step")).toBeVisible();

    await agent.act(
      "Choose not to add third-party data and create the inventory",
    );
    await expect(browser).toHaveURL(/\/cities\/[^/]+\/GHGI\/[^/]+\/?$/);

    await app.open(`/en/cities/${cityId}/GHGI`);
    await expect(screen.getByTestId("hero-project-name")).toHaveText(
      "CityCatalyst Demo",
    );
    await expect(screen.getByTestId("hero-city-name")).toHaveText("Chicago");
    await expect(screen.getByTestId("inventory-year-title")).toHaveText(
      "Inventories",
    );
    await expect(screen.getByTestId("add-new-inventory-button")).toBeVisible();
    await expect(
      screen.getByTestId("inventory-year").filter({ hasText: year }).first(),
    ).toHaveText(year);
    await expect(
      screen.getByTestId("tab-emission-inventory-calculation-title"),
    ).toHaveText("Inventory calculation");
    await expect(
      screen.getByTestId("tab-emission-inventory-results-title"),
    ).toHaveText("Emission inventory results");
    await expect(screen.getByTestId("sector-data-title")).toHaveText(
      "Sector Emissions",
    );
    await expect(screen.getByTestId("stationary-energy")).toHaveText(
      "Stationary energy",
    );
  },
);
