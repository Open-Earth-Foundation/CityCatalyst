import { APIRequestContext, expect, Page, test } from "@playwright/test";
import {
  createCityAndInventoryThroughOnboarding,
  navigateToDashboard,
  navigateToDataPage,
  navigateToGHGIModule,
} from "./helpers";

test.setTimeout(120000);

test.describe("Report Results", () => {
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
    console.log("cityId1", cityId);
    console.log("inventoryId1", inventoryId);
    await expect(page.getByText("Chicago")).toBeVisible();
  });

  //   can navigate to data page and select a subsector
  test("User can navigate to data page and select a subsector", async ({
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
      await expect(page.getByText(/activities added/i)).toBeVisible({
        timeout: 15000,
      });
      await expect(page.getByText(/Emissions:/i)).toBeVisible();
      await expect(page.getByText(/Fuel Type/i)).toBeVisible();
      await expect(page.getByText(/Data Quality/i)).toBeVisible();
      await expect(page.getByText(/Data Source/i)).toBeVisible();
      await expect(page.getByText(/Total Fuel Consumption/i)).toBeVisible();
      await expect(page.getByText(/Propane/i)).toBeVisible();
      return;
    }
    await expect(visibleMethodologyCards.first()).toBeVisible({
      timeout: 15000,
    });
    await visibleMethodologyCards.first().click();
    await page.waitForLoadState("networkidle");

    // can add data to subsector
    await page.getByTestId("add-emission-data-button").click();
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

  test("User can navigate to dashboard", async ({ page }) => {
    await navigateToDashboard(page, cityId);
    console.log("cityId2", cityId);
    await expect(page.getByText("Chicago")).toBeVisible();
  });
});
