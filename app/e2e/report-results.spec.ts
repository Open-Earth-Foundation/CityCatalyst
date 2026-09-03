import { expect, Locator, Page, test } from "@playwright/test";
import {
  createCityAndInventoryThroughOnboarding,
  dismissCookieConsent,
  navigateToDataPage,
} from "./helpers";

async function openResidentialSubsector(
  page: Page,
  cityId: string,
  inventoryId: string,
) {
  await page.goto(`/en/cities/${cityId}/GHGI/${inventoryId}/data/1/`);
  await expect(
    page.getByRole("heading", { name: /Stationary energy/i }),
  ).toBeVisible({ timeout: 30000 });

  const residentialCard = page
    .getByTestId("subsector-card")
    .filter({ hasText: /Residential/i });
  await expect(residentialCard.first()).toBeVisible({ timeout: 30000 });
  await residentialCard.first().click();
  await page.waitForURL(new RegExp(`/GHGI/${inventoryId}/data/1/[^/]+`));

  await expect(page.getByText(/I\.1.*Residential/i)).toBeVisible({
    timeout: 30000,
  });
}

function addActivityButton(page: Page, panel?: Locator) {
  const button = page.getByLabel("activity-button");
  return panel ? panel.getByLabel("activity-button") : button.first();
}

async function ensureMethodologySelected(
  page: Page,
  methodologyName: RegExp,
  panel?: Locator,
) {
  const addActivity = addActivityButton(page, panel);
  if (await addActivity.isVisible({ timeout: 3000 }).catch(() => false)) {
    return;
  }

  const methodologyCards = panel
    ? panel.getByTestId("methodology-card")
    : page.getByTestId("methodology-card");
  const methodologyCard = methodologyCards
    .filter({ hasText: methodologyName })
    .first();
  await expect(methodologyCard).toBeVisible({ timeout: 30000 });
  await methodologyCard.click();

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

async function fillEnergyConsumptionAmount(addEmissionModal: Locator) {
  // FormattedNumberInput has no htmlFor label wiring; amount is the first
  // decimal input in the modal (filled before emission-factor fields).
  const energyInput = addEmissionModal
    .locator('input[inputmode="decimal"]')
    .first();

  await expect(energyInput).toBeVisible({ timeout: 10000 });
  await energyInput.click();
  await energyInput.fill("");
  await energyInput.fill("100");
  await expect(energyInput).toHaveValue(/100/);
}

async function submitActivity(page: Page, addEmissionModal: Locator) {
  const createResponsePromise = page
    .waitForResponse(
      (resp) =>
        resp.url().includes("/activity-value") &&
        resp.request().method() === "POST",
      { timeout: 60000 },
    )
    .catch(() => null);

  await addEmissionModal.getByTestId("add-emission-modal-submit").click();

  try {
    await expect(addEmissionModal).not.toBeVisible({ timeout: 60000 });
  } catch {
    const createResponse = await createResponsePromise;
    if (createResponse && !createResponse.ok()) {
      const body = await createResponse.text().catch(() => "");
      throw new Error(
        `Activity create failed with status ${createResponse.status()}: ${body}`,
      );
    }

    const validationHints = await addEmissionModal
      .locator("[data-invalid], [aria-invalid='true']")
      .allTextContents()
      .catch(() => []);
    throw new Error(
      `Add-emission modal stayed open after submit. Validation hints: ${
        validationHints.filter(Boolean).join(" | ") || "none found"
      }`,
    );
  }
}

function openScopePanel(page: Page, scope: 1 | 2) {
  return page
    .locator('[role="tabpanel"][data-state="open"]')
    .or(page.getByRole("tabpanel", { name: new RegExp(`Scope ${scope}`, "i") }))
    .first();
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
  const stationaryEnergyCard = page.getByTestId(
    "stationary-energy-sector-card",
  );
  const sectorDataUrlGlob = `**/cities/${cityId}/GHGI/${inventoryId}/data/1/`;
  await Promise.all([
    page.waitForURL(sectorDataUrlGlob),
    stationaryEnergyCard.getByTestId("sector-card-button").click(),
  ]);
  await expect(
    page.getByRole("heading", { name: /Stationary energy/i }),
  ).toBeVisible({ timeout: 30000 });

  await openResidentialSubsector(page, cityId, inventoryId);
  await page.getByRole("tab", { name: /Scope 1/i }).click();

  const scopeOnePanel = openScopePanel(page, 1);
  await expect(scopeOnePanel).toBeVisible({ timeout: 30000 });
  const hasExistingActivity = await scopeOnePanel
    .getByText(/Propane/i)
    .isVisible()
    .catch(() => false);
  if (hasExistingActivity) {
    return;
  }

  await ensureMethodologySelected(page, /Fuel Consumption/i, scopeOnePanel);

  await addActivityButton(page, scopeOnePanel).click();
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

  await submitActivity(page, addEmissionModal);
}

async function addScope2ResidentialEmissions(
  page: Page,
  cityId: string,
  inventoryId: string,
) {
  await openResidentialSubsector(page, cityId, inventoryId);

  const scopeTwoTab = page.getByRole("tab", { name: /Scope 2/i });
  await scopeTwoTab.click();
  await expect(scopeTwoTab).toHaveAttribute("aria-selected", "true", {
    timeout: 10000,
  });

  const scopeTwoPanel = openScopePanel(page, 2);
  await expect(scopeTwoPanel).toBeVisible({ timeout: 30000 });
  const hasExistingActivity = await scopeTwoPanel
    .getByText(/Electricity|energy-usage-electricity|kWh/i)
    .isVisible()
    .catch(() => false);
  if (hasExistingActivity) {
    return;
  }

  await ensureMethodologySelected(page, /Energy Consumption/i, scopeTwoPanel);

  await addActivityButton(page, scopeTwoPanel).click();
  const addEmissionModal = page.getByTestId("add-emission-modal");
  await expect(addEmissionModal).toBeVisible();

  await addEmissionModal
    .getByLabel(/Building type/i)
    .selectOption("building-type-all");
  await addEmissionModal
    .getByLabel(/Energy usage type/i)
    .selectOption("energy-usage-electricity");
  await fillEnergyConsumptionAmount(addEmissionModal);
  const unitSelect = addEmissionModal.getByLabel(/Select Unit/i);
  await unitSelect.selectOption("units-kilowatt-hours");
  await expect(unitSelect).toHaveValue("units-kilowatt-hours");
  await fillCustomEmissionFactors(addEmissionModal);

  await submitActivity(page, addEmissionModal);
}

async function openEmissionInventoryResultsTab(page: Page) {
  await page.getByTestId("tab-emission-inventory-results-title").click();
  await expect(
    page.getByRole("tabpanel", { name: /Emission inventory results/i }),
  ).toBeVisible({ timeout: 30000 });
}

// Serial flow: one city/inventory, scope 1 + scope 2 data, then results tab assertions.
test.describe.serial("Report Results", () => {
  test.setTimeout(120000);

  let cityId: string;
  let inventoryId: string;

  test.beforeAll(async ({ browser }) => {
    test.setTimeout(180000);

    const context = await browser.newContext({
      storageState: "playwright/.auth/user.json",
    });
    const page = await context.newPage();

    const cityInventoryData =
      await createCityAndInventoryThroughOnboarding(page);
    cityId = cityInventoryData.cityId;
    inventoryId = cityInventoryData.inventoryId;

    await context.close();
  });

  test.beforeEach(async ({ page }) => {
    await page.goto(`/en/cities/${cityId}/GHGI/${inventoryId}/`);
    await dismissCookieConsent(page);

    const heroCityName = page.getByTestId("hero-city-name");
    await expect(heroCityName).toBeVisible({ timeout: 60000 });
    await expect(heroCityName).toHaveText("Chicago", { timeout: 10000 });
  });

  test("User can navigate to GHGI module", async ({ page }) => {
    await expect(page.getByTestId("hero-city-name")).toHaveText("Chicago");
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
    await openEmissionInventoryResultsTab(page);

    const topEmissionsTable = page.locator("table").filter({
      has: page.getByText(/Total emissions \(CO2eq\)/i),
    });
    await expect(topEmissionsTable).toBeVisible({ timeout: 60000 });

    await expect(page.getByText(/Top Emissions/i).first()).toBeVisible({
      timeout: 10000,
    });

    const residentialRows = topEmissionsTable
      .locator("tbody tr")
      .filter({ has: page.getByText("Residential buildings") });
    await expect(residentialRows).toHaveCount(2, { timeout: 60000 });
    await expect(
      residentialRows.filter({ has: page.getByText(/Scope 2/i) }),
    ).toHaveCount(1);
    await expect(
      residentialRows.filter({ has: page.getByText(/Scope 1/i) }),
    ).toHaveCount(1);

    await expect(
      residentialRows.locator("td").filter({ hasText: /268\.8 mtCO₂e/i }),
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
