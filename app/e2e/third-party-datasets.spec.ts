import { expect, Page, test } from "@playwright/test";
import {
  createCityAndInventoryThroughOnboarding,
  dismissCookieConsent,
  navigateToDataPage,
} from "./helpers";

const testIds = {
  addDataStepHeading: "add-data-step-title",
  stationaryEnergySectorCard: "stationary-energy-sector-card",
  sectorCardButton: "sector-card-button",
  subsectorCard: "subsector-card",
  sourceCard: "source-card",
  noDataSourcesMessage: "no-data-sources-message",
};

async function openStationaryEnergySectorPage(
  page: Page,
  cityId: string,
  inventoryId: string,
) {
  await navigateToDataPage(page, cityId, inventoryId);

  await expect(page.getByTestId(testIds.addDataStepHeading)).toContainText(
    "Add Data",
    { timeout: 30000 },
  );

  const stationaryEnergyCard = page.getByTestId(
    testIds.stationaryEnergySectorCard,
  );
  await expect(stationaryEnergyCard).toBeVisible({ timeout: 30000 });

  const sectorDataUrl = `**/cities/${cityId}/GHGI/${inventoryId}/data/1/`;
  await Promise.all([
    page.waitForURL(sectorDataUrl),
    stationaryEnergyCard.getByTestId(testIds.sectorCardButton).click(),
  ]);

  await expect(
    page.getByRole("heading", { name: /Stationary energy/i }),
  ).toBeVisible({ timeout: 30000 });
  await expect(page.getByTestId(testIds.subsectorCard).first()).toBeVisible({
    timeout: 30000,
  });
}

async function searchThirdPartyDatasets(page: Page, inventoryId: string) {
  const searchButton = page.getByRole("button", {
    name: /Search for available datasets/i,
  });
  await searchButton.scrollIntoViewIfNeeded();
  await expect(searchButton).toBeVisible({ timeout: 30000 });

  const datasourceResponse = page.waitForResponse(
    (resp) =>
      resp.url().includes(`/datasource/${inventoryId}`) &&
      resp.request().method() === "GET" &&
      resp.ok(),
    { timeout: 60000 },
  );
  await searchButton.click();
  await datasourceResponse;
}

test.describe("Third Party Datasets", () => {
  test.describe.configure({ mode: "serial" });
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
    await dismissCookieConsent(page);
  });

  test("should search and manage third-party datasets on sector page", async ({
    page,
  }) => {
    await openStationaryEnergySectorPage(page, cityId, inventoryId);
    await searchThirdPartyDatasets(page, inventoryId);

    const sourceCards = page.getByTestId(testIds.sourceCard);
    const noDataMessage = page.getByTestId(testIds.noDataSourcesMessage);

    await expect(sourceCards.first().or(noDataMessage)).toBeVisible({
      timeout: 30000,
    });

    if (await noDataMessage.isVisible()) {
      await expect(noDataMessage).toBeVisible();
      return;
    }

    const firstSourceCard = sourceCards.first();
    const connectButton = firstSourceCard.getByRole("button", {
      name: /^Connect data$/i,
    });

    if (
      (await connectButton.isVisible()) &&
      (await connectButton.isEnabled())
    ) {
      const connectResponse = page.waitForResponse(
        (resp) =>
          resp.url().includes(`/datasource/${inventoryId}`) &&
          resp.request().method() === "POST" &&
          resp.ok(),
        { timeout: 60000 },
      );
      await connectButton.click();
      await connectResponse;

      const connectedButton = firstSourceCard.getByRole("button", {
        name: /data connected/i,
      });
      await expect(connectedButton).toBeVisible({ timeout: 30000 });

      await firstSourceCard.hover();
      const disconnectButton = firstSourceCard.getByRole("button", {
        name: /disconnect data/i,
      });
      await expect(disconnectButton).toBeVisible({ timeout: 10000 });

      const disconnectResponse = page.waitForResponse(
        (resp) =>
          resp.url().includes(`/datasource/${inventoryId}/datasource/`) &&
          resp.request().method() === "DELETE" &&
          resp.ok(),
        { timeout: 60000 },
      );
      await disconnectButton.click();
      await disconnectResponse;

      await expect(connectButton).toBeVisible({ timeout: 30000 });
    }

    await firstSourceCard
      .getByRole("link", { name: /see more details/i })
      .click();
    await expect(
      page.getByRole("button", { name: /go back/i }),
    ).toBeVisible({ timeout: 30000 });
    await page.getByRole("button", { name: /go back/i }).click();
  });
});
