import { expect, Page, test } from "@playwright/test";
import {
  createCityAndInventoryThroughOnboarding,
  dismissCookieConsent,
  navigateToDataPage,
} from "./helpers";

const testIds = {
  addDataStepHeading: "add-data-step-title",
  stationaryEnergySectorCard: "stationary-energy-sector-card",
  transportationSectorCard: "transportation-sector-card",
  wasteSectorCard: "waste-sector-card",
  sectorCardButton: "sector-card-button",
  subsectorCard: "subsector-card",
  methodologyCard: "methodology-card",
};

const sectorData = [
  {
    sectorName: "Stationary Energy",
    testId: testIds.stationaryEnergySectorCard,
    sectorPath: "1",
  },
  {
    sectorName: "Transportation",
    testId: testIds.transportationSectorCard,
    sectorPath: "2",
  },
  {
    sectorName: "Waste",
    testId: testIds.wasteSectorCard,
    sectorPath: "3",
  },
] as const;

async function navigateToFirstSubsector(
  page: Page,
  cityId: string,
  inventoryId: string,
  sector: (typeof sectorData)[number],
) {
  await navigateToDataPage(page, cityId, inventoryId);

  const sectorCard = page.getByTestId(sector.testId);
  await expect(sectorCard).toBeVisible({ timeout: 30000 });

  const sectorDataUrl = `**/cities/${cityId}/GHGI/${inventoryId}/data/${sector.sectorPath}/`;
  await Promise.all([
    page.waitForURL(sectorDataUrl),
    sectorCard.getByTestId(testIds.sectorCardButton).click(),
  ]);

  const subsectorCards = page.getByTestId(testIds.subsectorCard);
  await expect(subsectorCards.first()).toBeVisible({ timeout: 30000 });
  await subsectorCards.first().click();

  await page.waitForURL(
    new RegExp(`/GHGI/${inventoryId}/data/${sector.sectorPath}/[^/]+`),
  );
}

test.describe.serial("Manual Input", () => {
  test.setTimeout(120000);

  let cityId: string;
  let inventoryId: string;

  test.beforeAll(async ({ browser }) => {
    test.setTimeout(180000);

    const context = await browser.newContext({
      storageState: "playwright/.auth/user.json",
    });
    const page = await context.newPage();

    const result = await createCityAndInventoryThroughOnboarding(page);
    cityId = result.cityId;
    inventoryId = result.inventoryId;

    await context.close();
  });

  test.beforeEach(async ({ page }) => {
    await page.goto(`/en/cities/${cityId}/GHGI/${inventoryId}/`);
    await dismissCookieConsent(page);
    await expect(page.getByTestId("hero-city-name")).toBeVisible({
      timeout: 60000,
    });
  });

  test("should render sector list page", async ({ page }) => {
    await navigateToDataPage(page, cityId, inventoryId);

    await expect(page.getByTestId(testIds.addDataStepHeading)).toHaveText(
      "Add Data to Complete Your GHG Inventory",
    );
    await expect(
      page.getByTestId(testIds.stationaryEnergySectorCard),
    ).toBeVisible();
    await expect(
      page.getByTestId(testIds.transportationSectorCard),
    ).toBeVisible();
    await expect(page.getByTestId(testIds.wasteSectorCard)).toBeVisible();
  });

  for (const sector of sectorData) {
    test.describe.serial(() => {
      test(`should navigate to ${sector.sectorName} sector page`, async ({
        page,
      }) => {
        await navigateToFirstSubsector(page, cityId, inventoryId, sector);
      });

      test(`should list methodologies in ${sector.sectorName}`, async ({
        page,
      }) => {
        test.skip(
          sector.sectorName === "Waste" ||
            sector.sectorName === "Transportation",
          "Methodology picker coverage is limited to stationary energy for now",
        );

        await navigateToFirstSubsector(page, cityId, inventoryId, sector);
        await page.getByRole("tab", { name: /Scope 1/i }).click();

        const scopeOnePanel = page.getByRole("tabpanel", {
          name: /Scope 1/i,
        });
        const methodologyCards = scopeOnePanel.getByTestId(
          testIds.methodologyCard,
        );
        await expect(methodologyCards.first()).toBeVisible({ timeout: 30000 });
        expect(await methodologyCards.count()).toBeGreaterThan(0);
      });

      // TODO: re-enable when direct-measure manual input flow is stable again
      test.skip(`test direct measure methodology in scope 1 with incomplete & complete values in ${sector.sectorName}`, async () => {});

      // TODO: re-enable when activity table assertions work with dynamic manual input
      test.skip(`should display newly created activity in activity table in ${sector.sectorName}`, async () => {});

      // TODO: re-enable when delete-activity flow is covered for dynamic manual input
      test.skip(`should delete the activity from the table in ${sector.sectorName}`, async () => {});
    });
  }
});
