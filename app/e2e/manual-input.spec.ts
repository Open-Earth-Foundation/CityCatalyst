import { test, expect, Page, APIRequestContext } from "@playwright/test";
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

test.describe("Manual Input", () => {
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
    const navButton = `[data-testid="${testIds.addDataToInventoryNavButton}"]`;
    await page.waitForSelector(navButton);
    await page.click(navButton);
    await page.waitForURL(regexForPath("/data/"));
    await expect(page).toHaveURL(regexForPath("/data/"));
    const pageHeader = page.getByTestId(testIds.addDataStepHeading);
    await expect(pageHeader).toHaveText(
      "Add Data to Complete Your GHG Inventory",
    );

    // check for sector cards
    const stationaryEnergySectorCard = await page.getByTestId(
      testIds.stationaryEnergySectorCard,
    );
    expect(stationaryEnergySectorCard).toBeTruthy();

    const transportationSectorCard = await page.getByTestId(
      testIds.transportationSectorCard,
    );
    expect(transportationSectorCard).toBeTruthy();

    const wasteSectorCard = await page.getByTestId(testIds.wasteSectorCard);
    expect(wasteSectorCard).toBeTruthy();
  });

  sectorData.forEach((sector) => {
    test.describe(() => {
      test(`should navigate to ${sector.sectorName} sector page`, async () => {
        await page.goto(`/en/${id}/data/`);
        await page.waitForURL(regexForPath("/data/"));
        await expect(page).toHaveURL(regexForPath("/data/"));

        // wait for sector card to load
        const sectorCard = await page.waitForSelector(
          `[data-testid="${sector.testId}"]`,
        );
        expect(sectorCard).toBeTruthy();
        const sectorCardBtn = await sectorCard?.$(
          `[data-testid="${testIds.sectorCardButton}"]`,
        );
        await sectorCardBtn?.click();
        await page.waitForURL(regexForPath(sector.url1));
        await expect(page).toHaveURL(regexForPath(sector.url1));

        await page.waitForResponse((resp) => resp.status() == 200);
        // wait for 10 seconds
        await page.waitForTimeout(3000);

        const subsectorCrds = await page.$$(
          `[data-testid=${testIds.subsectorCard}]`,
        );
        expect(subsectorCrds.length).toBeGreaterThan(0);

        // await page response

        await page.waitForSelector(`[data-testid="${testIds.subsectorCard}"]`);
        const targetSubSector = subsectorCrds[0];
        await targetSubSector.click();
        await expect(page).toHaveURL(
          /\/data\/\d+\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/$/,
        );
      });

      test(`should list methodologies in ${sector.sectorName}`, async () => {
        // check on a list of methodologies
        const methodologyCards = await page.$$(
          `[data-testid=${testIds.methodologyCard}]`,
        );
        expect(methodologyCards.length).toBeGreaterThan(0);
      });

      test(`test direct measure methodology in scope 1 with incomplete  & complete values in in ${sector.sectorName}`, async () => {
        test.skip(sector.sectorName === "Waste");
        // look for a direct measure
        // select all the methodology card headers and check if any of them is direct measure
        const directMeasureCardHeader = await page.$(
          `[data-testid=${testIds.methodologyCardHeader}]` &&
            "text=Direct Measure",
        );

        expect(directMeasureCardHeader).toBeTruthy();
        // click on the direct measure card
        await directMeasureCardHeader?.click();

        const addEmissionButton = await page.$(
          `[data-testid=${testIds.addEmissionButton}]`,
        );
        expect(addEmissionButton).toBeTruthy();
        await addEmissionButton?.click();

        // wait for the modal to open;
        const addEmissionModal = await page.waitForSelector(
          `[data-testid=${testIds.addEmissionModal}]`,
        );

        // fill in the select fields
        const selectElements = await addEmissionModal.$$("select");

        for (const selectElement of selectElements) {
          await selectElement.selectOption({ index: 1 });
          await page.waitForTimeout(1000); // Selects the first option (index 0)
        }

        // fill in the  numeric input fields
        const numericInputs = await addEmissionModal.$$(
          'input[inputmode="decimal"][pattern="[0-9]*(\\.[0-9]+)?"]',
        );

        for (const input of numericInputs) {
          await input.fill("122"); // Example: filling with the value '1.0'
        }

        // try to submit the form
        const submitButton = await addEmissionModal.$(
          `[data-testid=${testIds.addEmissionModalSubmitButton}]`,
        );

        await submitButton?.click();

        // look for error-text within the modal "please select a source reference"
        const element = await page.getByText(
          "Please select a source reference",
        );

        expect(element).toBeTruthy();

        // fill in the text field
        const textInputs = await addEmissionModal.$$("textarea");
        for (const textInput of textInputs) {
          await textInput.fill("test values");
        }

        await submitButton?.click();

        // wait for a 200 response
        await page.waitForResponse((resp) => resp.status() == 200);
        // wait for 10 seconds
        await page.waitForTimeout(3000);
      });

      test(`should display newly created activity in activity table in in ${sector.sectorName}`, async () => {
        test.skip(sector.sectorName === "Waste");
        // wait for the page to load
        // wait for the table to load
        const table = await page.waitForSelector("table");

        // Ensure the table exists
        expect(table).not.toBeNull();

        // Get all the rows in the table (excluding the header row if there is one)
        const rows = await table?.$$("tbody tr");

        // Ensure the table has at least one row
        expect(rows?.length).toBeGreaterThan(0);

        const cellWithValue = await page
          ?.getByRole("cell", { name: "tCO2" })
          .first();

        expect(cellWithValue).toBeTruthy();
      });
    });
  });
});
