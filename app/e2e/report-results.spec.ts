import { expect, Locator, Page, test } from "@playwright/test";
import {
  createCityAndInventoryThroughOnboarding,
  navigateToDashboard,
  navigateToDataPage,
} from "./helpers";

async function openResidentialSubsector(page: Page, cityId: string, inventoryId: string) {
  await page.goto(`/en/cities/${cityId}/GHGI/${inventoryId}/data/1/`);
  await page.waitForLoadState("networkidle");
  const subsectorCards = page.getByTestId("subsector-card");
  await expect(subsectorCards.first()).toBeVisible();
  await subsectorCards.first().click();
  await page.waitForLoadState("networkidle");
  await expect(page.getByText("I.1 Residential buildings")).toBeVisible();
}

async function fillCustomEmissionFactors(addEmissionModal: Locator) {
  await addEmissionModal
    .getByLabel(/Select emission factor type/i)
    .selectOption("custom");
  await addEmissionModal.getByLabel("CO2 emission factor").fill("10");
  await addEmissionModal.getByLabel("N2O emission factor").fill("10");
  await addEmissionModal.getByLabel("CH4 emission factor").fill("1");
  await addEmissionModal.getByLabel(/Data Quality/i).selectOption("high");
  await addEmissionModal.getByLabel("Data source").fill("test");
  await addEmissionModal.getByLabel("Explanatory comments").fill("test");
}

async function addScope1ResidentialEmissions(
  page: Page,
  cityId: string,
  inventoryId: string,
) {
  await navigateToDataPage(page, cityId, inventoryId);

  await expect(
    page.getByText("Add Data to Complete Your GHG Inventory"),
  ).toBeVisible();
  const stationaryEnergyCard = page.getByTestId("stationary-energy-sector-card");
  const sectorDataUrlGlob = `**/cities/${cityId}/GHGI/${inventoryId}/data/1/`;
  await Promise.all([
    page.waitForURL(sectorDataUrlGlob),
    stationaryEnergyCard.getByTestId("sector-card-button").click(),
  ]);
  await page.waitForLoadState("networkidle");
  await expect(
    page.getByRole("heading", { name: /Stationary energy/i }),
  ).toBeVisible();

  await openResidentialSubsector(page, cityId, inventoryId);

  const scopeOnePanel = page.getByLabel(/Scope 1/i);
  const hasExistingActivity = await scopeOnePanel
    .getByText(/Propane/i)
    .isVisible()
    .catch(() => false);
  if (hasExistingActivity) {
    return;
  }

  const methodologyCards = page.getByTestId("methodology-card");
  await expect(methodologyCards.first()).toBeVisible({ timeout: 30000 });
  await methodologyCards.first().click();
  await page.waitForLoadState("networkidle");

  await page.getByText(/Add activity/i).click();
  const addEmissionModal = page.getByTestId("add-emission-modal");
  await expect(addEmissionModal).toBeVisible();

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
  await fillCustomEmissionFactors(addEmissionModal);

  await addEmissionModal.getByTestId("add-emission-modal-submit").click();
  await expect(addEmissionModal).not.toBeVisible({ timeout: 30000 });
}

async function addScope2ResidentialEmissions(
  page: Page,
  cityId: string,
  inventoryId: string,
) {
  await openResidentialSubsector(page, cityId, inventoryId);
  await page.getByText("Scope 2").click();

  const scopeTwoPanel = page.getByLabel(/Scope 2/i);
  const hasExistingActivity = await scopeTwoPanel
    .getByText(/activities added/i)
    .isVisible()
    .catch(() => false);
  if (hasExistingActivity) {
    return;
  }

  const methodologyCards = page.getByTestId("methodology-card");
  await expect(methodologyCards.first()).toBeVisible({ timeout: 30000 });
  await methodologyCards.first().click();
  await page.waitForLoadState("networkidle");

  await page.getByText(/Add activity/i).click();
  const addEmissionModal = page.getByTestId("add-emission-modal");
  await expect(addEmissionModal).toBeVisible();

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
  await fillCustomEmissionFactors(addEmissionModal);

  await addEmissionModal.getByTestId("add-emission-modal-submit").click();
  await expect(addEmissionModal).not.toBeVisible({ timeout: 30000 });
}

// Serial flow: one city/inventory, scope 1 + scope 2 data, then dashboard assertions.
test.describe.serial("Report Results", () => {
  test.setTimeout(120000);

  let cityId: string;
  let inventoryId: string;

  test.beforeAll(async ({ browser }) => {
    const page = await browser.newPage();
    const cityInventoryData =
      await createCityAndInventoryThroughOnboarding(page);
    cityId = cityInventoryData.cityId;
    inventoryId = cityInventoryData.inventoryId;
    await page.close();
  });

  test("User can navigate to GHGI module", async ({ page }) => {
    await page.goto(`/en/cities/${cityId}/GHGI/${inventoryId}/`);
    await page.waitForLoadState("networkidle");
    await expect(page.getByText("Chicago")).toBeVisible();
  });

  test("User can navigate to subsector page and enter scope 1 emissions data", async ({
    page,
  }) => {
    await addScope1ResidentialEmissions(page, cityId, inventoryId);
  });

  test("User can navigate to subsector page and enter scope 2 emissions data", async ({
    page,
  }) => {
    await addScope2ResidentialEmissions(page, cityId, inventoryId);
  });

  test("User can navigate to dashboard and verify data", async ({ page }) => {
    await navigateToDashboard(page, cityId);
    await expect(page.getByText("Chicago")).toBeVisible();

    const topEmissionsTable = page.locator("table").filter({
      has: page.getByText(/Total emissions \(CO2eq\)/i),
    });
    await expect(topEmissionsTable).toBeVisible({ timeout: 30000 });

    const topEmissionsHeading = page.getByRole("heading", {
      name: /Top Emissions/i,
    });
    await expect(topEmissionsHeading).toBeVisible();

    const residentialRows = topEmissionsTable
      .locator("tbody tr")
      .filter({ has: page.getByText("Residential buildings") });
    await expect(residentialRows).toHaveCount(2, { timeout: 30000 });
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
