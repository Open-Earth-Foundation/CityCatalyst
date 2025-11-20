import { APIRequestContext, expect, Page, test } from "@playwright/test";
import {
  createCityAndInventoryThroughOnboarding,
  navigateToDashboard,
  navigateToDataPage,
  navigateToGHGIModule,
} from "./helpers";

test.describe("Report Results", () => {
  test.setTimeout(120000);
  // before each test, create a city and inventory
  let cityId: string;
  let inventoryId: string;
  test.beforeEach(async ({ page }) => {
    const cityInventoryData =
      await createCityAndInventoryThroughOnboarding(page);
    cityId = cityInventoryData.cityId;
    inventoryId = cityInventoryData.inventoryId;
  });

  //   can navigate to ghgimodule
  test("User can navigate to GHGI module", async ({ page }) => {
    await page.waitForLoadState("networkidle");
    await navigateToGHGIModule(page);
    await expect(page.getByText("Chicago")).toBeVisible();
  });

  //   can navigate to data page and select a subsector
  test("User can navigate to subsector page and enter scope 1 emissions data", async ({
    page,
  }) => {
    await navigateToDataPage(page, cityId, inventoryId);

    await expect(
      page.getByText("Add Data to Complete Your GHG Inventory"),
    ).toBeVisible();
    const stationaryEnergyCard = page.getByTestId(
      "stationary-energy-sector-card",
    );
    const sectorDataUrlGlob = `**/cities/${cityId}/GHGI/${inventoryId}/data/1/`;
    await Promise.all([
      page.waitForURL(sectorDataUrlGlob),
      stationaryEnergyCard.getByTestId("sector-card-button").click(),
    ]);
    await page.waitForLoadState("networkidle");
    await expect(
      page.getByRole("heading", { name: /Stationary energy/i }),
    ).toBeVisible();
    const subsectorCards = page.getByTestId("subsector-card");
    await expect(subsectorCards.first()).toBeVisible();
    await subsectorCards.first().click();
    await page.waitForLoadState("networkidle");
    await expect(page.getByText("I.1 Residential buildings")).toBeVisible();

    // select methodology when cards exist, otherwise verify existing data table
    const visibleMethodologyCards = page.locator(
      '[data-testid="methodology-card"]:visible',
    );
    const visibleMethodologyCount = await visibleMethodologyCards.count();
    if (visibleMethodologyCount === 0) {
      const scopeOnePanel = page.getByLabel(/Scope 1/i);
      await expect(scopeOnePanel.getByText(/activities added/i)).toBeVisible({
        timeout: 15000,
      });
      await expect(scopeOnePanel.getByText(/Emissions:/i)).toBeVisible();
      await expect(scopeOnePanel.getByText(/Fuel Type/i)).toBeVisible();
      await expect(scopeOnePanel.getByText(/Data Quality/i)).toBeVisible();
      await expect(scopeOnePanel.getByText(/Data Source/i)).toBeVisible();
      await expect(
        scopeOnePanel.getByText(/Total Fuel Consumption/i),
      ).toBeVisible();
      await expect(scopeOnePanel.getByText(/Propane/i)).toBeVisible();
      return;
    }
    await expect(visibleMethodologyCards.first()).toBeVisible({
      timeout: 15000,
    });
    await visibleMethodologyCards.first().click();
    await page.waitForLoadState("networkidle");

    // can add data to subsector
    await page.getByText(/Add activity/i).click();
    const addEmissionModal = page.getByTestId("add-emission-modal");
    await expect(addEmissionModal).toBeVisible();

    // fill in the form fields
    await addEmissionModal
      .getByLabel(/Building type/i)
      .selectOption("building-type-all");

    await addEmissionModal
      .getByLabel(/Fuel type/i)
      .selectOption("fuel-type-propane");

    await addEmissionModal.getByLabel("Total fuel consumption").fill("100");

    await addEmissionModal
      .getByLabel(/Select Unit/i)
      .selectOption("units-cubic-meters");

    await addEmissionModal
      .getByLabel(/Select emission factor type/i)
      .selectOption("custom");

    await addEmissionModal.getByLabel("CO2 emission factor").fill("10");

    await addEmissionModal.getByLabel("N2O emission factor").fill("10");

    await addEmissionModal.getByLabel("CH4 emission factor").fill("1");

    await addEmissionModal.getByLabel(/Data Quality/i).selectOption("high");

    await addEmissionModal.getByLabel("Data source").fill("test");
    await addEmissionModal.getByLabel("Explanatory comments").fill("test");

    await addEmissionModal.getByTestId("add-emission-modal-submit").click();
    await expect(addEmissionModal).not.toBeVisible({ timeout: 30000 });
  });

  test("User can navigate to subsector page and enter scope 2 emissions data", async ({
    page,
  }) => {
    // navigate to subsector page
    await page.goto(`/en/cities/${cityId}/GHGI/${inventoryId}/data/1/`);
    await page.waitForLoadState("networkidle");
    const subsectorCards = page.getByTestId("subsector-card");
    await expect(subsectorCards.first()).toBeVisible();
    await subsectorCards.first().click();
    await page.waitForLoadState("networkidle");
    await expect(page.getByText("I.1 Residential buildings")).toBeVisible();

    // select scope 1 tab
    await page.getByText("Scope 2").click();
    // select methodology when cards exist, otherwise verify existing data table
    const visibleMethodologyCards = page.locator(
      '[data-testid="methodology-card"]:visible',
    );
    const visibleMethodologyCount = await visibleMethodologyCards.count();
    if (visibleMethodologyCount === 0) {
      const scopeTwoPanel = page.getByLabel(/Scope 2/i);
      await expect(scopeTwoPanel.getByText(/activities added/i)).toBeVisible({
        timeout: 15000,
      });
      return;
    }

    await expect(visibleMethodologyCards.first()).toBeVisible({
      timeout: 15000,
    });
    await visibleMethodologyCards.first().click();
    await page.waitForLoadState("networkidle");

    // can add data to subsector
    await page.getByText(/Add activity/i).click();
    const addEmissionModal = page.getByTestId("add-emission-modal");
    await expect(addEmissionModal).toBeVisible();

    // fill in the form fields
    await addEmissionModal
      .getByLabel(/Building type/i)
      .selectOption("building-type-all");
    await addEmissionModal
      .getByLabel(/Energy usage type/i)
      .selectOption("energy-usage-electricity");

    await addEmissionModal.getByLabel("Energy consumption").fill("100");

    await addEmissionModal
      .getByLabel(/Select Unit/i)
      .selectOption("units-kilowatt-hours");

    await addEmissionModal
      .getByLabel(/Select emission factor type/i)
      .selectOption("custom");

    await addEmissionModal.getByLabel("CO2 emission factor").fill("10");

    await addEmissionModal.getByLabel("N2O emission factor").fill("10");

    await addEmissionModal.getByLabel("CH4 emission factor").fill("1");

    await addEmissionModal.getByLabel(/Data Quality/i).selectOption("high");

    await addEmissionModal.getByLabel("Data source").fill("test");
    await addEmissionModal.getByLabel("Explanatory comments").fill("test");

    await addEmissionModal.getByTestId("add-emission-modal-submit").click();
    await expect(addEmissionModal).not.toBeVisible({ timeout: 30000 });
  });

  test("User can navigate to dashboard and verify data", async ({ page }) => {
    await navigateToDashboard(page, cityId);
    await expect(page.getByText("Chicago")).toBeVisible();

    const topEmissionsHeading = page.getByRole("heading", {
      name: /Top Emissions/i,
    });
    await expect(topEmissionsHeading).toBeVisible();

    const topEmissionsTable = page.locator("table").filter({
      has: page.getByText(/Total emissions \(CO2eq\)/i),
    });
    await expect(topEmissionsTable).toBeVisible();

    const residentialRows = topEmissionsTable
      .locator("tbody tr")
      .filter({ has: page.getByText("Residential buildings") });
    await expect(residentialRows).toHaveCount(2);
    await expect(residentialRows.first()).toContainText("Scope 2");
    await expect(residentialRows.nth(1)).toContainText("Scope 1");

    await expect(
      residentialRows.locator("td").filter({ hasText: /268\.8 t CO2e/i }),
    ).toHaveCount(2);

    const percentageTexts = await residentialRows
      .locator("td")
      .filter({ hasText: /%/ })
      .allInnerTexts();
    const totalPercentage = percentageTexts.reduce((sum, text) => {
      const numericValue = parseFloat(text.replace("%", "").trim());
      return sum + (Number.isNaN(numericValue) ? 0 : numericValue);
    }, 0);
    expect(totalPercentage).toBeCloseTo(100, 1);
  });
});
