import { expect, Locator, Page, test } from "@playwright/test";
import {
  createCityAndInventoryThroughOnboarding,
  navigateToDashboard,
  navigateToDataPage,
  navigateToGHGIModule,
} from "./helpers";

async function openResidentialBuildingsSubsector(page: Page) {
  const subsectorCards = page.getByTestId("subsector-card");
  await expect(subsectorCards.first()).toBeVisible();
  await subsectorCards.first().click();
  await page.waitForLoadState("networkidle");
  await expect(page.getByText("I.1 Residential buildings")).toBeVisible();
}

async function selectMethodologyIfNeeded(page: Page, scopeLabel: RegExp) {
  await page.waitForTimeout(3000);

  const visibleMethodologyCards = page.getByTestId("methodology-card");
  const visibleMethodologyCount = await visibleMethodologyCards.count();
  if (visibleMethodologyCount === 0) {
    const scopePanel = page.getByLabel(scopeLabel);
    await expect(scopePanel.getByText(/activities added/i)).toBeVisible({
      timeout: 15000,
    });
    return false;
  }

  await expect(visibleMethodologyCards.first()).toBeVisible({
    timeout: 15000,
  });
  await visibleMethodologyCards.first().click();
  await page.waitForLoadState("networkidle");
  return true;
}

async function submitResidentialEmissionActivity(
  page: Page,
  options: {
    scope: "scope-1" | "scope-2";
    consumptionLabel: string;
    consumptionValue: string;
    unitOption: string;
    extraFields?: (modal: Locator) => Promise<void>;
  },
) {
  await page.getByText(/Add activity/i).click();
  const addEmissionModal = page.getByTestId("add-emission-modal");
  await expect(addEmissionModal).toBeVisible();

  await addEmissionModal
    .getByLabel(/Building type/i)
    .selectOption("building-type-all");

  if (options.extraFields) {
    await options.extraFields(addEmissionModal);
  }

  await addEmissionModal.getByLabel(options.consumptionLabel).fill(options.consumptionValue);
  await addEmissionModal.getByLabel(/Select Unit/i).selectOption(options.unitOption);
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
}

async function addScope1ResidentialEmissions(
  page: Page,
  cityId: string,
  inventoryId: string,
) {
  await navigateToDataPage(page, cityId, inventoryId);

  const stationaryEnergyCard = page.getByTestId("stationary-energy-sector-card");
  const sectorDataUrlGlob = `**/cities/${cityId}/GHGI/${inventoryId}/data/1/`;
  await Promise.all([
    page.waitForURL(sectorDataUrlGlob),
    stationaryEnergyCard.getByTestId("sector-card-button").click(),
  ]);
  await page.waitForLoadState("networkidle");

  await openResidentialBuildingsSubsector(page);
  const addedNewData = await selectMethodologyIfNeeded(page, /Scope 1/i);
  if (!addedNewData) {
    return;
  }

  await submitResidentialEmissionActivity(page, {
    scope: "scope-1",
    consumptionLabel: "Total fuel consumption",
    consumptionValue: "100",
    unitOption: "units-cubic-meters",
    extraFields: async (modal) => {
      await modal.getByLabel(/Fuel type/i).selectOption("fuel-type-propane");
    },
  });
}

async function addScope2ResidentialEmissions(
  page: Page,
  cityId: string,
  inventoryId: string,
) {
  await page.goto(`/en/cities/${cityId}/GHGI/${inventoryId}/data/1/`);
  await page.waitForLoadState("networkidle");

  await openResidentialBuildingsSubsector(page);
  await page.getByText("Scope 2").click();
  const addedNewData = await selectMethodologyIfNeeded(page, /Scope 2/i);
  if (!addedNewData) {
    return;
  }

  await submitResidentialEmissionActivity(page, {
    scope: "scope-2",
    consumptionLabel: "Energy consumption",
    consumptionValue: "100",
    unitOption: "units-kilowatt-hours",
    extraFields: async (modal) => {
      await modal
        .getByLabel(/Energy usage type/i)
        .selectOption("energy-usage-electricity");
    },
  });
}

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
    await expect(
      page.getByText("Add Data to Complete Your GHG Inventory"),
    ).toBeVisible();
    await addScope1ResidentialEmissions(page, cityId, inventoryId);

    const scopeOnePanel = page.getByLabel(/Scope 1/i);
    await expect(scopeOnePanel.getByText(/activities added/i)).toBeVisible({
      timeout: 15000,
    });
    await expect(scopeOnePanel.getByText(/Emissions:/i)).toBeVisible();
    await expect(scopeOnePanel.getByText(/Fuel Type/i)).toBeVisible();
    await expect(scopeOnePanel.getByText(/Data Quality/i)).toBeVisible();
    await expect(scopeOnePanel.getByText(/Data Source/i)).toBeVisible();
    await expect(scopeOnePanel.getByText(/Total Fuel Consumption/i)).toBeVisible();
    await expect(scopeOnePanel.getByText(/Propane/i)).toBeVisible();
  });

  test("User can navigate to subsector page and enter scope 2 emissions data", async ({
    page,
  }) => {
    await addScope2ResidentialEmissions(page, cityId, inventoryId);

    const scopeTwoPanel = page.getByLabel(/Scope 2/i);
    await expect(scopeTwoPanel.getByText(/activities added/i)).toBeVisible({
      timeout: 15000,
    });
  });

  test("User can navigate to dashboard and verify data", async ({ page }) => {
    await addScope1ResidentialEmissions(page, cityId, inventoryId);
    await addScope2ResidentialEmissions(page, cityId, inventoryId);

    await navigateToDashboard(page, cityId);
    await expect(page.getByTestId("hero-city-name")).toHaveText("Chicago");

    // Wait for the results API call to complete by waiting for the table to appear
    // The table only appears when data is loaded, ensuring the widget is no longer in loading state
    const topEmissionsTable = page.locator("table").filter({
      has: page.getByText(/Total emissions \(CO2eq\)/i),
    });
    await expect(topEmissionsTable).toBeVisible({ timeout: 30000 });

    // Now that data is loaded, check for the heading
    const topEmissionsHeading = page.getByRole("heading", {
      name: /Top Emissions/i,
    });
    await expect(topEmissionsHeading).toBeVisible();

    const residentialRows = topEmissionsTable
      .locator("tbody tr")
      .filter({ has: page.getByText("Residential buildings") });
    await expect(residentialRows).toHaveCount(2);
    await expect(
      residentialRows.filter({ has: page.getByText(/Scope 2/i) }),
    ).toHaveCount(1);
    await expect(
      residentialRows.filter({ has: page.getByText(/Scope 1/i) }),
    ).toHaveCount(1);

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
