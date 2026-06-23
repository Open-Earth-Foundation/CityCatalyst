import { APIRequestContext, expect, Locator, Page, test } from "@playwright/test";
import {
  createCityAndInventoryThroughOnboarding,
  navigateToDashboard,
} from "./helpers";

const AUTH_STORAGE = "playwright/.auth/user.json";

async function fetchResidentialSubsectorId(
  request: APIRequestContext,
  inventoryId: string,
): Promise<string> {
  const progressRes = await request.get(
    `/api/v1/inventory/${inventoryId}/progress`,
  );
  expect(progressRes.ok()).toBeTruthy();
  const { data } = await progressRes.json();
  const stationarySector = data.sectorProgress.find(
    (sector: { sector: { referenceNumber: string } }) =>
      sector.sector.referenceNumber === "I",
  );
  const residential = stationarySector?.subSectors.find(
    (subSector: { referenceNumber?: string }) =>
      subSector.referenceNumber === "I.1",
  );
  if (!residential?.subsectorId) {
    throw new Error(
      `Residential subsector I.1 not found for inventory ${inventoryId}`,
    );
  }
  return residential.subsectorId as string;
}

/** Wait until scope tabs and manual-entry UI are rendered (inventory + scopes loaded). */
async function waitForSubsectorActivityReady(page: Page) {
  await expect(page.getByRole("tab", { name: /Scope 1/i })).toBeVisible({
    timeout: 60000,
  });

  const activityUi = page
    .getByTestId("manual-input-header")
    .or(page.getByText(/Select methodology|Select The Methodology/i).first())
    .or(page.getByText(/Add activity/i))
    .or(page.getByTestId("methodology-card").first());

  await expect(activityUi).toBeVisible({ timeout: 60000 });
}

async function openResidentialSubsector(
  page: Page,
  cityId: string,
  inventoryId: string,
  subsectorId: string,
) {
  await page.goto(
    `/en/cities/${cityId}/GHGI/${inventoryId}/data/1/${subsectorId}?refNo=I.1`,
  );

  await expect(page.getByText(/I\.1.*Residential/i)).toBeVisible({
    timeout: 60000,
  });
  await waitForSubsectorActivityReady(page);
}

/** Select a methodology when the picker is shown; no-op if already in data-entry mode. */
async function ensureMethodologySelected(page: Page) {
  const addActivity = page.getByText(/Add activity/i);
  if (await addActivity.isVisible({ timeout: 3000 }).catch(() => false)) {
    return;
  }

  await expect(
    page.getByText(/Select methodology|Select The Methodology/i).first(),
  ).toBeVisible({ timeout: 30000 });

  const methodologyCards = page.getByTestId("methodology-card");
  await expect(methodologyCards.first()).toBeVisible({ timeout: 30000 });
  await methodologyCards.first().click();
  await expect(addActivity).toBeVisible({ timeout: 30000 });
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
  subsectorId: string,
) {
  await openResidentialSubsector(page, cityId, inventoryId, subsectorId);

  const scopeOnePanel = page.getByRole("tabpanel");
  const hasExistingActivity = await scopeOnePanel
    .getByText(/Propane/i)
    .isVisible()
    .catch(() => false);
  if (hasExistingActivity) {
    return;
  }

  await ensureMethodologySelected(page);

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
  subsectorId: string,
) {
  await openResidentialSubsector(page, cityId, inventoryId, subsectorId);
  await page.getByRole("tab", { name: /Scope 2/i }).click();
  await waitForSubsectorActivityReady(page);

  const scopeTwoPanel = page.getByRole("tabpanel");
  const hasExistingActivity = await scopeTwoPanel
    .getByText(/activities added/i)
    .isVisible()
    .catch(() => false);
  if (hasExistingActivity) {
    return;
  }

  await ensureMethodologySelected(page);

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
  test.setTimeout(180000);

  let cityId: string;
  let inventoryId: string;
  let residentialSubsectorId: string;

  test.beforeAll(async ({ browser }) => {
    const context = await browser.newContext({ storageState: AUTH_STORAGE });
    const page = await context.newPage();
    const cityInventoryData =
      await createCityAndInventoryThroughOnboarding(page);
    cityId = cityInventoryData.cityId;
    inventoryId = cityInventoryData.inventoryId;
    residentialSubsectorId = await fetchResidentialSubsectorId(
      context.request,
      inventoryId,
    );
    await page.close();
    await context.close();
  });

  test("User can navigate to GHGI module", async ({ page }) => {
    await page.goto(`/en/cities/${cityId}/GHGI/${inventoryId}/`);
    await page.waitForLoadState("networkidle");
    await expect(page.getByText("Chicago")).toBeVisible();
  });

  test("User can navigate to subsector page and enter scope 1 emissions data", async ({
    page,
  }) => {
    await addScope1ResidentialEmissions(
      page,
      cityId,
      inventoryId,
      residentialSubsectorId,
    );
  });

  test("User can navigate to subsector page and enter scope 2 emissions data", async ({
    page,
  }) => {
    await addScope2ResidentialEmissions(
      page,
      cityId,
      inventoryId,
      residentialSubsectorId,
    );
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
