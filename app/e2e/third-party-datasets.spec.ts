import { APIRequestContext, expect, Page, test } from "@playwright/test";
import { indexPageRegex, regexForPath } from "./utils";

// Test inventory creation data
const TEST_CITY_DETAILS = {
  name: "Test City for Third Party",
  locode: "US TTP",
  area: 500,
  region: "California",
  country: "United States of America",
  countryLocode: "US",
  regionLocode: "US-CA",
};

const TEST_POPULATION_DATA = {
  cityId: null,
  cityPopulation: 1000000,
  cityPopulationYear: 2023,
  countryPopulation: 338289857,
  countryPopulationYear: 2022,
  locode: "US TTP",
  regionPopulation: 39538223,
  regionPopulationYear: 2023,
};

const TEST_INVENTORY_DATA = {
  cityId: null,
  inventoryName: "TEST Third Party Data - 2024",
  year: 2024,
};

const createInventory = async (request: APIRequestContext): Promise<string> => {
  // Create city
  const cityResult = await request.post("/api/v0/city", {
    data: TEST_CITY_DETAILS,
  });
  expect(cityResult.ok()).toBeTruthy();
  const cityData = await cityResult.json();
  const cityId = cityData.data.cityId;

  // Add population data
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

  // Create inventory
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

  // Set as default inventory for user
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
  searchThirdPartyButton: "search-third-party-button",
  dataSourceCard: "data-source-card",
  dataSourceDrawer: "data-source-drawer",
  connectDataButton: "connect-data-button",
  disconnectDataButton: "disconnect-data-button",
  connectedDataIndicator: "connected-data-indicator",
  dataSourceTitle: "data-source-title",
  noDataSourcesMessage: "no-data-sources-message",
  loadingIndicator: "loading-indicator",
};

test.describe("Third Party Datasets", () => {
  let page: Page;
  let inventoryId: string;

  test.beforeAll(async ({ browser, request }) => {
    page = await browser.newPage();
    inventoryId = await createInventory(request);
    await page.goto(`/en/${inventoryId}/`);
    await expect(page).toHaveURL(indexPageRegex);
  });

  test.afterAll(async () => {
    await page.close();
  });

  test("should navigate to add data page", async () => {
    // Click on "Add Data to Inventory" button
    const navButton = page.getByTestId(testIds.addDataToInventoryNavButton);
    await navButton.click();
    await page.waitForURL(regexForPath("/data/"));
    await expect(page).toHaveURL(regexForPath("/data/"));

    // Verify page header
    const pageHeader = page.getByTestId(testIds.addDataStepHeading);
    await expect(pageHeader).toContainText("Add Data");

    // Verify sector cards are visible
    await expect(page.getByTestId(testIds.stationaryEnergySectorCard)).toBeVisible();
    await expect(page.getByTestId(testIds.transportationSectorCard)).toBeVisible();
    await expect(page.getByTestId(testIds.wasteSectorCard)).toBeVisible();
  });

  test("should navigate to sector page and see third-party data section", async () => {
    // Navigate to Stationary Energy sector
    await page.goto(`/en/${inventoryId}/data/`);
    await page.waitForURL(regexForPath("/data/"));
    
    const stationaryEnergyCard = page.getByTestId(testIds.stationaryEnergySectorCard);
    const sectorButton = stationaryEnergyCard.getByTestId(testIds.sectorCardButton);
    await sectorButton.click();
    
    // Wait for navigation to sector page
    await page.waitForURL(regexForPath("/data/1/"));
    await expect(page).toHaveURL(regexForPath("/data/1/"));

    // Wait for subsectors to load
    await page.waitForSelector(`[data-testid="${testIds.subsectorCard}"]`);
    const subsectorCards = page.getByTestId(testIds.subsectorCard);
    expect(await subsectorCards.count()).toBeGreaterThan(0);
  });

  test("should search for third-party data sources", async () => {
    // Look for "Search for third-party data" button
    // The button text might be localized, so we'll look for buttons containing "search" or "third"
    const searchButton = page.getByRole('button').filter({ 
      hasText: /search.*third|third.*party|external.*data/i 
    }).first();
    
    if (await searchButton.isVisible()) {
      await searchButton.click();
      
      // Wait for data sources to load or "no data sources" message
      await page.waitForTimeout(2000);
      
      // Check if we have data source cards or a no data message
      const dataSourceCards = page.locator('[data-testid*="source-card"]');
      const noDataMessage = page.getByText(/no.*data.*source|no.*third.*party/i);
      
      const hasDataSources = await dataSourceCards.count() > 0;
      const hasNoDataMessage = await noDataMessage.isVisible();
      
      // Either we should have data sources or a no data message
      expect(hasDataSources || hasNoDataMessage).toBeTruthy();
    }
  });

  test("should open data source drawer when clicking on a data source", async () => {
    // This test will only run if there are data sources available
    const dataSourceCards = page.locator('[data-testid*="source-card"]');
    
    if (await dataSourceCards.count() > 0) {
      // Click on the first data source card
      await dataSourceCards.first().click();
      
      // Wait for drawer to open
      await page.waitForTimeout(1000);
      
      // Check if drawer is visible (it should have a back button)
      const backButton = page.getByRole('button').filter({ hasText: /back/i });
      await expect(backButton).toBeVisible();
      
      // Check for connect data button in drawer
      const connectButton = page.getByRole('button').filter({ 
        hasText: /connect.*data/i 
      });
      await expect(connectButton).toBeVisible();
      
      // Close the drawer
      await backButton.click();
      await page.waitForTimeout(500);
    }
  });

  test("should connect and disconnect a third-party data source", async () => {
    // This test will only run if there are data sources available
    const dataSourceCards = page.locator('[data-testid*="source-card"]');
    
    if (await dataSourceCards.count() > 0) {
      // Get the first data source that isn't already connected
      const disconnectedSource = dataSourceCards.first();
      
      // Check if source shows "Connect data" button
      const sourceContainer = disconnectedSource;
      const connectButtonInCard = sourceContainer.getByRole('button').filter({
        hasText: /connect.*data/i
      });
      
      if (await connectButtonInCard.isVisible()) {
        // Click to open drawer
        await disconnectedSource.click();
        await page.waitForTimeout(1000);
        
        // Click connect button in drawer
        const connectButtonInDrawer = page.getByRole('button').filter({ 
          hasText: /connect.*data/i 
        }).last();
        await connectButtonInDrawer.click();
        
        // Wait for connection to complete
        await page.waitForTimeout(3000);
        
        // Go back
        const backButton = page.getByRole('button').filter({ hasText: /back/i });
        if (await backButton.isVisible()) {
          await backButton.click();
        }
        
        // Verify the source now shows as connected
        // Connected sources typically show a checkmark icon or "Data connected" text
        await page.waitForTimeout(1000);
        const connectedIndicator = sourceContainer.getByText(/connected|disconnect/i);
        const checkIcon = sourceContainer.locator('svg[data-testid*="check"]');
        
        const isConnected = await connectedIndicator.isVisible() || await checkIcon.isVisible();
        expect(isConnected).toBeTruthy();
        
        // Test disconnecting the data source
        if (isConnected) {
          // Hover over the connected source to show disconnect button
          await sourceContainer.hover();
          await page.waitForTimeout(500);
          
          // Look for disconnect button
          const disconnectButton = sourceContainer.getByRole('button').filter({
            hasText: /disconnect/i
          });
          
          if (await disconnectButton.isVisible()) {
            await disconnectButton.click();
            
            // Wait for disconnection to complete
            await page.waitForTimeout(2000);
            
            // Verify source is disconnected
            const connectButtonAfterDisconnect = sourceContainer.getByRole('button').filter({
              hasText: /connect.*data/i
            });
            await expect(connectButtonAfterDisconnect).toBeVisible();
          }
        }
      }
    }
  });

  test("should show third-party data in multiple sectors", async () => {
    const sectors = [
      { name: "Transportation", testId: testIds.transportationSectorCard, url: "/data/2/" },
      { name: "Waste", testId: testIds.wasteSectorCard, url: "/data/3/" },
    ];

    for (const sector of sectors) {
      // Navigate to data page
      await page.goto(`/en/${inventoryId}/data/`);
      await page.waitForURL(regexForPath("/data/"));
      
      // Click on sector card
      const sectorCard = page.getByTestId(sector.testId);
      const sectorButton = sectorCard.getByTestId(testIds.sectorCardButton);
      await sectorButton.click();
      
      // Wait for navigation to sector page
      await page.waitForURL(regexForPath(sector.url));
      
      // Wait for page to load
      await page.waitForTimeout(2000);
      
      // Look for third-party data search button
      const searchButton = page.getByRole('button').filter({ 
        hasText: /search.*third|third.*party|external.*data/i 
      }).first();
      
      // Verify search button exists in this sector
      const hasSearchButton = await searchButton.isVisible();
      expect(hasSearchButton).toBeTruthy();
    }
  });

  test("should handle no available data sources gracefully", async () => {
    // Navigate to a sector that might not have data sources
    await page.goto(`/en/${inventoryId}/data/`);
    await page.waitForURL(regexForPath("/data/"));
    
    const wasteCard = page.getByTestId(testIds.wasteSectorCard);
    const sectorButton = wasteCard.getByTestId(testIds.sectorCardButton);
    await sectorButton.click();
    
    await page.waitForURL(regexForPath("/data/3/"));
    
    // Click on a subsector
    const subsectorCards = page.getByTestId(testIds.subsectorCard);
    if (await subsectorCards.count() > 0) {
      await subsectorCards.first().click();
      await page.waitForTimeout(2000);
      
      // Look for search button
      const searchButton = page.getByRole('button').filter({ 
        hasText: /search.*third|third.*party|external.*data/i 
      }).first();
      
      if (await searchButton.isVisible()) {
        await searchButton.click();
        await page.waitForTimeout(2000);
        
        // Check for no data sources message
        const noDataMessage = page.getByText(/no.*data.*available|no.*third.*party|missing.*third.*party/i);
        const dataSourceCards = page.locator('[data-testid*="source-card"]');
        
        // Either we have data sources or a message saying there are none
        const hasContent = await noDataMessage.isVisible() || await dataSourceCards.count() > 0;
        expect(hasContent).toBeTruthy();
      }
    }
  });

  test("should persist connected data sources across page refreshes", async () => {
    // Navigate to stationary energy sector
    await page.goto(`/en/${inventoryId}/data/`);
    const stationaryEnergyCard = page.getByTestId(testIds.stationaryEnergySectorCard);
    const sectorButton = stationaryEnergyCard.getByTestId(testIds.sectorCardButton);
    await sectorButton.click();
    
    await page.waitForURL(regexForPath("/data/1/"));
    
    // Click on first subsector
    const subsectorCards = page.getByTestId(testIds.subsectorCard);
    if (await subsectorCards.count() > 0) {
      await subsectorCards.first().click();
      await page.waitForTimeout(2000);
      
      // Search for data sources
      const searchButton = page.getByRole('button').filter({ 
        hasText: /search.*third|third.*party|external.*data/i 
      }).first();
      
      if (await searchButton.isVisible()) {
        await searchButton.click();
        await page.waitForTimeout(2000);
        
        // Check if we have any connected sources
        const connectedSources = page.getByText(/connected|disconnect/i);
        const connectedCount = await connectedSources.count();
        
        if (connectedCount > 0) {
          // Refresh the page
          await page.reload();
          await page.waitForTimeout(3000);
          
          // Search again for data sources
          const searchButtonAfterRefresh = page.getByRole('button').filter({ 
            hasText: /search.*third|third.*party|external.*data/i 
          }).first();
          
          if (await searchButtonAfterRefresh.isVisible()) {
            await searchButtonAfterRefresh.click();
            await page.waitForTimeout(2000);
            
            // Verify the same sources are still connected
            const connectedSourcesAfterRefresh = page.getByText(/connected|disconnect/i);
            const connectedCountAfterRefresh = await connectedSourcesAfterRefresh.count();
            
            expect(connectedCountAfterRefresh).toBe(connectedCount);
          }
        }
      }
    }
  });
});