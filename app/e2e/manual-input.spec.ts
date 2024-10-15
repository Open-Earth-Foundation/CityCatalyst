import { APIRequestContext, expect, Page, test } from "@playwright/test";
import { indexPageRegex, regexForPath } from "./utils";

// inventory creation data
// call the endpoint to create an inventory

const TEST_CITY_DETAILS = {
  name: "New York",
  locode: "US NYC",
  area: 1219,
  region: "New York",
  country: "United States of America",
  countryLocode: "US",
  regionLocode: "US-NY",
};

const TEST_POPULATION_DATA = {
  cityId: null,
  cityPopulation: 8804190,
  cityPopulationYear: 2020,
  countryPopulation: 338289857,
  countryPopulationYear: 2022,
  locode: "US NYC",
  regionPopulation: 20201249,
  regionPopulationYear: 2020,
};

const TEST_INVENTORY_DATA = {
  cityId: null,
  inventoryName: "TEST New York - 2024",
  year: 2024,
};

const createInventory = async (request: APIRequestContext): Promise<string> => {
  const cityResult = await request.post("/api/v0/city", {
    data: TEST_CITY_DETAILS,
  });
  expect(cityResult.ok()).toBeTruthy();
  const cityData = await cityResult.json();
  let cityId = cityData.data.cityId;

  // add population data
  const populationResult = await request.post(
    `/api/v0/city/${cityId}/population`,
    {
      data: {
        ...TEST_POPULATION_DATA,
        cityId: cityId,
      },
    },
  );
  expect(populationResult.ok()).toBeTruthy();

  // add inventory data
  const inventoryResult = await request.post(
    `/api/v0/city/${cityId}/inventory`,
    {
      data: {
        ...TEST_INVENTORY_DATA,
        cityId: cityId,
      },
    },
  );

  expect(inventoryResult.ok()).toBeTruthy();
  const inventoryData = await inventoryResult.json();
  const inventoryID = inventoryData.data.inventoryId;

  // make default inventory for user

  await request.patch("/api/v0/user", {
    data: {
      cityId: cityData.id,
      defaultInventoryId: inventoryID,
    },
  });

  return inventoryID;
};

const testIds = {
  addDataToInventoryNavButton: "add-data-to-inventory-card",
  addDataStepHeading: "add-data-step-title",
  stationaryEnergySectorCard: "stationary-energy-sector-card",
  transportationSectorCard: "transportation-sector-card",
  wasteSectorCard: "waste-sector-card",
  sectorCardButton: "sector-card-button",
  subsectorCard: "subsector-card",
  manualInputHeader: "manual-input-header",
  methodologyCard: "methodology-card",
  methodologyCardHeader: "methodology-card-header",
  addEmissionButton: "add-emission-data-button",
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

const sectorData = [
  {
    sectorName: "Stationary Energy",
    testId: testIds.stationaryEnergySectorCard,
    url1: "/data/1/",
  },
  {
    sectorName: "Transportation",
    testId: testIds.transportationSectorCard,
    url1: "/data/2/",
  },
  {
    sectorName: "Waste",
    testId: testIds.wasteSectorCard,
    url1: "/data/3/",
  },
];

const EmissionFactors = {
  CO2: 120,
  N2O: 202,
  CH4: 300,
};

test.describe.serial("Manual Input", () => {
  test.skip();
  let page: Page;
  let id: string;

  test.beforeAll(async ({ browser, request }) => {
    page = await browser.newPage();
    id = await createInventory(request);
    await page.goto(`/en/${id}/`);
    await expect(page).toHaveURL(indexPageRegex);
    // wait for page to load
  });

  test.afterAll(async () => {
    await page.close();
  });

  test("should render sector list page", async () => {
    const navButton = page.getByTestId(testIds.addDataToInventoryNavButton);
    await navButton.click();
    await page.waitForURL(regexForPath("/data/"));
    await expect(page).toHaveURL(regexForPath("/data/"));
    const pageHeader = page.getByTestId(testIds.addDataStepHeading);
    await expect(pageHeader).toHaveText(
      "Add Data to Complete Your GHG Inventory",
    );

    // check for sector cards
    const stationaryEnergySectorCard = page.getByTestId(
      testIds.stationaryEnergySectorCard,
    );
    expect(stationaryEnergySectorCard).toBeTruthy();

    const transportationSectorCard = page.getByTestId(
      testIds.transportationSectorCard,
    );
    expect(transportationSectorCard).toBeTruthy();

    const wasteSectorCard = page.getByTestId(testIds.wasteSectorCard);
    expect(wasteSectorCard).toBeTruthy();
  });

  sectorData.forEach((sector) => {
    test.describe.serial(() => {
      test(`should navigate to ${sector.sectorName} sector page`, async () => {
        await page.goto(`/en/${id}/data/`);
        await page.waitForURL(regexForPath("/data/"));
        await expect(page).toHaveURL(regexForPath("/data/"));
        // wait for sector card to load
        const sectorCard = page.getByTestId(sector.testId);
        expect(sectorCard).toBeTruthy();
        const sectorCardBtn = sectorCard?.getByTestId(testIds.sectorCardButton);
        await sectorCardBtn?.click();
        await page.waitForURL(regexForPath(sector.url1));
        await expect(page).toHaveURL(regexForPath(sector.url1));

        await page.waitForResponse((resp) => resp.status() == 200);
        // wait for 10 seconds
        await page.waitForTimeout(3000);

        const subsectorCards = page.getByTestId(testIds.subsectorCard);
        expect(await subsectorCards.count()).toBeGreaterThan(0);

        // await page response
        const targetSubSector = subsectorCards.first();
        await targetSubSector.click();
        await expect(page).toHaveURL(
          /\/data\/\d+\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/$/,
        );
      });

      test(`should list methodologies in ${sector.sectorName}`, async () => {
        test.skip(
          sector.sectorName === "Waste" ||
            sector.sectorName === "Transportation",
        );
        // check on a list of methodologies

        await page.waitForTimeout(3000);
        const methodologyCards = page.getByTestId(testIds.methodologyCard);
        expect(await methodologyCards.count()).toBeGreaterThan(0);
      });

      // TODO this test case doesn't work with the new more dynamic version of manual input yet
      test.skip(`test direct measure methodology in scope 1 with incomplete & complete values in in ${sector.sectorName}`, async () => {
        // TODO expand test case to handle multi-select fields, and the dynamic nature of the form
        test.skip(
          sector.sectorName === "Waste" ||
            sector.sectorName === "Transportation",
        );

        // look for a direct measure card
        // select all the methodology card headers and check if any of them is direct measure
        const directMeasureCardHeader = page
          .getByTestId(testIds.methodologyCardHeader)
          .filter({
            hasText: "Direct Measure",
          })
          .first();

        // TODO sometimes we are already on the direct measure page here
        //await expect(directMeasureCardHeader).toBeVisible();

        // click on the direct measure card
        if (await directMeasureCardHeader?.isVisible()) {
          await directMeasureCardHeader?.click();
        }

        await page.getByTestId(testIds.addEmissionButton).click();

        // wait for the modal to open;
        const addEmissionModal = page.getByTestId(testIds.addEmissionModal);

        // fill in the select fields
        const selectElements = page.locator("select");
        for (let i = 0; i < (await selectElements.count()); i++) {
          const dropdown = selectElements.nth(i);
          const optionCount = await dropdown.locator("option").count();
          const index = optionCount >= 3 ? 2 : 1; // for dropdowns with many options, select the third one so we don't use the "All" option that leads to validation errors
          await dropdown.selectOption({ index });
        }

        const inputElements = page.locator("input[type='text']");
        for (let i = 0; i < (await inputElements.count()); i++) {
          const input = inputElements.nth(i);
          await input.fill("1");
        }

        const textInput = addEmissionModal.getByTestId(
          testIds.sourceReferenceInput,
        );

        await textInput.fill("Created by e2e test");

        // fill in the emission values
        // TODO wrong. These are total emissions amount, NOT emissions factors
        const co2Input = addEmissionModal.getByTestId(testIds.co2EmissionInput);
        await co2Input.fill(EmissionFactors.CO2.toString());

        const n2oInput = addEmissionModal.getByTestId(testIds.n2oEmissionInput);
        await n2oInput.fill(EmissionFactors.N2O.toString());

        const ch4Input = addEmissionModal.getByTestId(testIds.ch4EmissionInput);
        await ch4Input.fill(EmissionFactors.CH4.toString());

        // try to submit the form
        const submitButton = addEmissionModal.getByTestId(
          testIds.addEmissionModalSubmitButton,
        );

        await submitButton?.click();

        // look for error-text within the modal "please select a source reference"
        // TODO this will fail when using i18n, let's not use getByText if at all possible
        const element = page.getByText("Please select a source reference");
        expect(element).toBeTruthy();

        // fill in the text fields
        await textInput.fill("test");

        //const submitButton2 = page.getByTestId(testIds.addEmissionModalSubmitButton);
        await submitButton?.click();

        // wait for a 200 response
        await page.waitForResponse((resp) => resp.status() == 200);
        await page.waitForTimeout(3000);
      });

      // TODO doesn't work with the new more dynamic version of manual input
      test.skip(`should display newly created activity in activity table in in ${sector.sectorName}`, async () => {
        // TODO: Enable these tests when manul input for waste works.
        test.skip(
          sector.sectorName === "Waste" ||
            sector.sectorName === "Transportation",
        );
        // wait for the page to load
        // wait for the table to load
        const table = page.locator("table");

        // Ensure the table exists
        expect(table).not.toBeNull();
        await expect(table).toBeVisible();

        const cellWithValue = page?.getByRole("cell", { name: "tCO2" }).first();
        await expect(cellWithValue).toBeVisible();
      });

      // TODO doesn't work with the new more dynamic version of manual input
      test.skip(`should delete the activity from the table in in ${sector.sectorName}`, async () => {
        test.skip(
          sector.sectorName === "Waste" ||
            sector.sectorName === "Transportation",
        );
        // wait for the page to load
        // wait for the table to load
        const table = page.locator("table");
        expect(table).not.toBeNull();

        await page.getByTestId(testIds.activityMoreButton).click();
        await page.getByTestId(testIds.deleteActivityButton).click();

        // wait for the modal to open
        await page.waitForTimeout(500);
        const deleteModal = page.getByTestId(testIds.deleteActivityModalHeader);
        await expect(deleteModal).toBeVisible();

        const confirmButton = page.getByTestId(
          testIds.deleteActivityModalConfirmButton,
        );
        await expect(confirmButton).toBeVisible();
        await confirmButton.click();

        // wait for a 200 response
        await page.waitForResponse((resp) => resp.status() == 200);
        await page.waitForTimeout(500);
      });
    });
  });
});
