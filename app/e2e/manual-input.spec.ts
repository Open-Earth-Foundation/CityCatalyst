import { expect, Locator, Page, test } from "@playwright/test";
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
  addEmissionModal: "add-emission-modal",
  addEmissionModalSubmitButton: "add-emission-modal-submit",
  co2EmissionInput: "co2-emission-factor",
  n2oEmissionInput: "n2o-emission-factor",
  ch4EmissionInput: "ch4-emission-factor",
  sourceReferenceInput: "source-reference",
  activityMoreButton: "activity-more-icon",
  deleteActivityButton: "delete-activity-button",
  deleteActivityModalHeader: "delete-activity-modal-header",
  deleteActivityModalConfirmButton: "delete-activity-modal-confirm",
};

const EmissionValues = {
  CO2: "120",
  N2O: "202",
  CH4: "300",
};

const sectorData = [
  {
    sectorName: "Stationary Energy",
    testId: testIds.stationaryEnergySectorCard,
    sectorPath: "1",
    useResidentialSubsector: true,
  },
  {
    sectorName: "Transportation",
    testId: testIds.transportationSectorCard,
    sectorPath: "2",
    useResidentialSubsector: false,
  },
  {
    sectorName: "Waste",
    testId: testIds.wasteSectorCard,
    sectorPath: "3",
    useResidentialSubsector: false,
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

async function navigateToResidentialSubsector(
  page: Page,
  cityId: string,
  inventoryId: string,
) {
  await page.goto(`/en/cities/${cityId}/GHGI/${inventoryId}/data/1/`);
  await expect(
    page.getByRole("heading", { name: /Stationary energy/i }),
  ).toBeVisible({ timeout: 30000 });

  const residentialCard = page
    .getByTestId(testIds.subsectorCard)
    .filter({ hasText: /Residential/i });
  await expect(residentialCard.first()).toBeVisible({ timeout: 30000 });
  await residentialCard.first().click();
  await page.waitForURL(new RegExp(`/GHGI/${inventoryId}/data/1/[^/]+`));
}

async function openScopeOnePanel(
  page: Page,
  cityId: string,
  inventoryId: string,
  sector: (typeof sectorData)[number],
) {
  if (sector.useResidentialSubsector) {
    await navigateToResidentialSubsector(page, cityId, inventoryId);
  } else {
    await navigateToFirstSubsector(page, cityId, inventoryId, sector);
  }

  await page.getByRole("tab", { name: /Scope 1/i }).click();
  const scopeOnePanel = page.getByRole("tabpanel", { name: /Scope 1/i });
  await expect(scopeOnePanel).toBeVisible({ timeout: 30000 });
  return scopeOnePanel;
}

function addActivityButton(panel: Locator) {
  return panel.getByLabel("activity-button");
}

async function selectDirectMeasureMethodology(scopeOnePanel: Locator) {
  const directMeasureCard = scopeOnePanel
    .getByTestId(testIds.methodologyCard)
    .filter({ hasText: /Direct Measure/i })
    .first();
  await expect(directMeasureCard).toBeVisible({ timeout: 30000 });
  await directMeasureCard.click();
  await expect(addActivityButton(scopeOnePanel)).toBeVisible({
    timeout: 30000,
  });
}

async function fillDirectMeasureEmissionValues(addEmissionModal: Locator) {
  const emissionInputs = [
    { testId: testIds.co2EmissionInput, value: EmissionValues.CO2 },
    { testId: testIds.n2oEmissionInput, value: EmissionValues.N2O },
    { testId: testIds.ch4EmissionInput, value: EmissionValues.CH4 },
  ] as const;

  for (const { testId, value } of emissionInputs) {
    const input = addEmissionModal.getByTestId(testId);
    if (await input.isVisible().catch(() => false)) {
      await input.fill(value);
    }
  }
}

async function fillMultiSelectFields(_page: Page, addEmissionModal: Locator) {
  const transportGroup = addEmissionModal
    .getByRole("group")
    .filter({ hasText: "Transport type" });
  if (!(await transportGroup.isVisible().catch(() => false))) {
    return;
  }

  const existingSelection = transportGroup.getByText(
    /Passenger vehicles|Commercial vehicles|Public transport vehicles/i,
  );
  if (await existingSelection.isVisible().catch(() => false)) {
    return;
  }

  await transportGroup.getByRole("combobox").click();
  await transportGroup
    .getByRole("option", { name: /Passenger vehicles/i })
    .click();
}

async function selectDropdownValue(dropdown: Locator) {
  const preferredValues = [
    "building-type-all",
    "fuel-type-propane",
    "fuel-type-gasoline",
    "fuel-type-all",
    "units-tonnes",
    "high",
  ];

  for (const value of preferredValues) {
    if ((await dropdown.locator(`option[value="${value}"]`).count()) > 0) {
      await dropdown.selectOption(value);
      return;
    }
  }

  const enabledOptions = dropdown.locator("option:not([disabled])");
  const optionCount = await enabledOptions.count();
  for (let i = 0; i < optionCount; i++) {
    const optionValue = await enabledOptions.nth(i).getAttribute("value");
    if (optionValue) {
      await dropdown.selectOption(optionValue);
      return;
    }
  }
}

async function fillDirectMeasureSelectFields(addEmissionModal: Locator) {
  const selectElements = addEmissionModal.locator("select");
  const selectCount = await selectElements.count();
  for (let i = 0; i < selectCount; i++) {
    const dropdown = selectElements.nth(i);
    if (await dropdown.inputValue()) {
      continue;
    }
    await selectDropdownValue(dropdown);
  }
}

async function fillDirectMeasureTextFields(addEmissionModal: Locator) {
  const textInputs = addEmissionModal.locator('input[type="text"]');
  const inputCount = await textInputs.count();
  for (let i = 0; i < inputCount; i++) {
    const input = textInputs.nth(i);
    const testId = await input.getAttribute("data-testid");
    if (
      testId === testIds.co2EmissionInput ||
      testId === testIds.n2oEmissionInput ||
      testId === testIds.ch4EmissionInput
    ) {
      continue;
    }
    if (await input.inputValue()) {
      continue;
    }
    await input.fill("e2e test");
  }
}

/** Fill required direct-measure fields; omit comments to exercise validation. */
async function fillDirectMeasureRequiredFields(
  page: Page,
  addEmissionModal: Locator,
  options?: { includeComments?: boolean },
) {
  await fillDirectMeasureSelectFields(addEmissionModal);
  await fillMultiSelectFields(page, addEmissionModal);
  await fillDirectMeasureEmissionValues(addEmissionModal);
  await fillDirectMeasureTextFields(addEmissionModal);

  const dataQuality = addEmissionModal.getByLabel(/Data Quality/i);
  if (await dataQuality.isVisible().catch(() => false)) {
    await dataQuality.selectOption("high");
  }

  const dataSource = addEmissionModal.getByLabel("Data source");
  if (await dataSource.isVisible().catch(() => false)) {
    await dataSource.fill("e2e test");
  }

  if (options?.includeComments !== false) {
    await addEmissionModal
      .getByTestId(testIds.sourceReferenceInput)
      .fill("Created by e2e test");
  }
}

async function hasDirectMeasureMethodology(scopeOnePanel: Locator) {
  return scopeOnePanel
    .getByTestId(testIds.methodologyCard)
    .filter({ hasText: /Direct Measure/i })
    .first()
    .isVisible({ timeout: 5000 })
    .catch(() => false);
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
        if (sector.useResidentialSubsector) {
          await navigateToResidentialSubsector(page, cityId, inventoryId);
          return;
        }
        await navigateToFirstSubsector(page, cityId, inventoryId, sector);
      });

      test(`should list methodologies in ${sector.sectorName}`, async ({
        page,
      }) => {
        const scopeOnePanel = await openScopeOnePanel(
          page,
          cityId,
          inventoryId,
          sector,
        );
        const methodologyCards = scopeOnePanel.getByTestId(
          testIds.methodologyCard,
        );
        await expect(methodologyCards.first()).toBeVisible({ timeout: 30000 });
        expect(await methodologyCards.count()).toBeGreaterThan(0);
      });

      test(`test direct measure methodology in scope 1 with incomplete & complete values in ${sector.sectorName}`, async ({
        page,
      }) => {
        const scopeOnePanel = await openScopeOnePanel(
          page,
          cityId,
          inventoryId,
          sector,
        );
        if (!(await hasDirectMeasureMethodology(scopeOnePanel))) {
          test.skip(
            true,
            `Direct Measure is not available for the ${sector.sectorName} subsector under test`,
          );
        }

        await selectDirectMeasureMethodology(scopeOnePanel);
        await addActivityButton(scopeOnePanel).click();

        const addEmissionModal = page.getByTestId(testIds.addEmissionModal);
        await expect(addEmissionModal).toBeVisible({ timeout: 30000 });

        await fillDirectMeasureRequiredFields(page, addEmissionModal, {
          includeComments: false,
        });

        const submitButton = addEmissionModal.getByTestId(
          testIds.addEmissionModalSubmitButton,
        );
        await submitButton.click();

        await expect(
          addEmissionModal.getByText(/Please add any relevant context/i),
        ).toBeVisible({ timeout: 10000 });

        await addEmissionModal
          .getByTestId(testIds.sourceReferenceInput)
          .fill("Created by e2e test");
        await submitButton.click();
        await expect(addEmissionModal).not.toBeVisible({ timeout: 30000 });
      });

      test(`should display newly created activity in activity table in ${sector.sectorName}`, async ({
        page,
      }) => {
        const scopeOnePanel = await openScopeOnePanel(
          page,
          cityId,
          inventoryId,
          sector,
        );
        if (!(await hasDirectMeasureMethodology(scopeOnePanel))) {
          test.skip(
            true,
            `Direct Measure is not available for the ${sector.sectorName} subsector under test`,
          );
        }

        const activityTable = scopeOnePanel.locator("table");
        await expect(activityTable).toBeVisible({ timeout: 30000 });
        await expect(
          activityTable.getByRole("cell", { name: /CO2e/i }).first(),
        ).toBeVisible({ timeout: 30000 });
      });

      test(`should delete the activity from the table in ${sector.sectorName}`, async ({
        page,
      }) => {
        const scopeOnePanel = await openScopeOnePanel(
          page,
          cityId,
          inventoryId,
          sector,
        );
        if (!(await hasDirectMeasureMethodology(scopeOnePanel))) {
          test.skip(
            true,
            `Direct Measure is not available for the ${sector.sectorName} subsector under test`,
          );
        }

        const activityTable = scopeOnePanel.locator("table");
        await expect(activityTable).toBeVisible({ timeout: 30000 });

        await scopeOnePanel.getByTestId(testIds.activityMoreButton).first().click();
        await page.getByTestId(testIds.deleteActivityButton).click();

        const deleteModal = page.getByTestId(testIds.deleteActivityModalHeader);
        await expect(deleteModal).toBeVisible({ timeout: 10000 });

        await page.getByTestId(testIds.deleteActivityModalConfirmButton).click();
        await expect(deleteModal).not.toBeVisible({ timeout: 30000 });
      });
    });
  }
});
