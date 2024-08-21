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
  sectorCard: "sector-card",
  sectorCardButton: "sector-card-button",
  subsectorCard: "subsector-card",
  manualInputHeader: "manual-input-header",
};

test.describe("Manual Input", () => {
  let page: Page;

  test.beforeAll(async ({ browser, request }) => {
    page = await browser.newPage();
    const id = await createInventory(request);
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
    const sectorCrds = await page.$$(`[data-testid="${testIds.sectorCard}"]`);
    expect(sectorCrds.length).toBeGreaterThan(0);
  });

  test("should navigate to a sub sector page", async () => {
    const sectorCrdsButtons = await page.$$(
      `[data-testid="${testIds.sectorCardButton}"]`,
    );
    await sectorCrdsButtons[0].click();
    await page.waitForURL(regexForPath("/data/1/"));
    await expect(page).toHaveURL(regexForPath("/data/1/"));
    // wait for page to load
    await page.waitForSelector(`[data-testid="${testIds.subsectorCard}"]`);
    const subsectorCrds = await page.$$(
      `[data-testid=${testIds.subsectorCard}]`,
    );
    expect(subsectorCrds.length).toBeGreaterThan(0);

    const targetSubSector = subsectorCrds[0];
    await targetSubSector.click();
    await expect(page).toHaveURL(
      /\/data\/\d+\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/$/,
    );
  });

  test.skip("should list methodologies", async () => {
    // see a list of the methodologies
    await page.click(`[data-testid="subsector-card"]`); // clicks on the first subsector card
    await expect(page).toHaveURL(/.*subsector-page/); // adjust regex to match your subsector page URL
  });

  test.skip("test direct measure", async () => {
    // click the direct measure card ? find the one with the text in it
    // it should load the data entry page for the methodology
    // clicking on the entry button should lead
  });

  test.skip("should display correct number of methodology cards based on subsector reference number", async () => {
    const referenceNumber = await page.getAttribute(
      `[data-testid="subsector-reference"]`,
      "data-reference-number",
    );
    const methodologyCards = await page.$$(`[data-testid="methodology-card"]`);
    // Replace with logic to determine the correct number of methodology cards based on the reference number
    const expectedMethodologyCount = 3; // example value
    expect(methodologyCards.length).toBe(expectedMethodologyCount);
  });
});
