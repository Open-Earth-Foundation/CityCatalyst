import { test, expect } from "@playwright/test";

test.describe("Onboarding Flow", () => {
  const lng = "en";
  test.describe("Start Page", () => {
    test("should display the onboarding start page", async ({ page }) => {
      // Navigate to start page before each test
      await page.goto(`/${lng}/onboarding/`);

      //   Verify the title of the page is correct
      await expect(page).toHaveTitle(/CityCatalyst/i);

      //   check that the heading with data-testid="start-page-title" has the correct text
      const startPageTitle = page.getByTestId(/start-page-title/i);
      await expect(startPageTitle).toHaveText("Create Inventory");

      //   Check that the main heading is present and has the correct text
      const mainHeading = page.getByTestId(/start-page-heading/i);
      await expect(mainHeading).toHaveText(/Create your GHG Inventory/i);

      //   Check that the description is present and has the correct text
      const description = page.getByTestId(/start-page-description/i);
      await expect(description).toHaveText(
        /In this step, configure your city's GHG emissions inventory by selecting the inventory year, setting the target, and adding contextual data such as population./i,
      );
      //   Verify the "Start Inventory" button is present and clickable
      const startButton = page.getByRole("button", {
        name: /Start inventory/i,
      });
      await expect(startButton).toBeVisible();

      //   Click the "Start Inventory" button
      await startButton.click();
    });
  });
  test.describe("Select City Step", () => {
    test.beforeEach(async ({ page }) => {
      // Navigate to the setup page
      await page.goto(`/${lng}/onboarding/setup`);
    });

    test("Select City step displays correctly", async ({ page }) => {
      // Verify tht the heading is displayed
      const heading = page.getByTestId("setup-city-heading");
      await expect(heading).toHaveText(/Select City/i);

      //   Verify tht the description is displayed
      const description = page.getByTestId("setup-city-description");
      await expect(description).toHaveText(
        /Search and select the city or municipality for which you want to create your GHG emission inventory./i,
      );

      //   Verify that the search lable is visible
      const cityInputLabel = page.getByTestId("setup-city-input-label");
      await expect(cityInputLabel).toHaveText(/City/i);

      // Verify that the "Continue" button is present
      const continueButton = page.getByRole("button", { name: /Continue/i });
      await expect(continueButton).toBeVisible();
    });

    test("User can select a city and proceed to the next step", async ({
      page,
    }) => {
      // Fill in the city input
      const cityInput = page.locator('input[name="city"]');
      await cityInput.click();

      await page.keyboard.type("Chicago", { delay: 100 });

      //   Wait for the search results to load
      const citySearchResults = page.getByText(
        /^Chicago\s*United States of America > Illinois$/,
      );
      await citySearchResults.waitFor();

      //   Click the city suggestion
      await citySearchResults.click();

      // Verify that the map is displayed
      const cityMap = page.locator(".pigeon-overlays");
      await expect(cityMap).toBeVisible();

      const continueButton = page.getByRole("button", { name: /Continue/i });
      await expect(continueButton).toBeEnabled();

      // Click the "Continue" button
      await continueButton.click();

      // Verify that the page navigated to the next step
      const nextStepHeading = page.getByTestId("inventory-details-heading");
      await expect(nextStepHeading).toBeVisible();
    });

    test.describe("Set Inventory Details Step", () => {
      test.setTimeout(60000);
      test.beforeEach(async ({ page }) => {
        // Navigate to the setup page
        await page.goto(`/${lng}/onboarding/setup`, {
          waitUntil: "networkidle",
        });

        // Fill in the city input
        const cityInput = page.locator('input[name="city"]');
        await cityInput.click();

        await page.keyboard.type("Chicago", { delay: 100 });

        //   Wait for the search results to load
        const citySearchResults = page.getByText(
          /^Chicago\s*United States of America > Illinois$/,
        );
        await citySearchResults.waitFor();

        //   Click the city suggestion
        await citySearchResults.click();

        // Click the "Continue" button
        const continueButton = page.getByRole("button", { name: /Continue/i });
        await continueButton.click();
        // Verify the heading
        const nextStepHeading = page.getByTestId("inventory-details-heading");
        await expect(nextStepHeading).toBeVisible();
      });

      test("Set Inventory Details step displays correctly", async ({
        page,
      }) => {
        // Verify the heading
        const addInventoryDetailsHeading = page.getByTestId(
          "inventory-details-heading",
        );
        await expect(addInventoryDetailsHeading).toHaveText(
          /Set up inventory details/i,
        );
        // Verify the description
        const addInventoryDetailsDescription = page.getByTestId(
          "inventory-details-description",
        );
        await expect(addInventoryDetailsDescription).toHaveText(
          /Provide some basic details about the inventory you want to create. You can edit these settings afterwards./i,
        );
        // Verify that the inventory year select is visible
        const yearSelect = page.getByTestId("inventory-details-heading");
        await expect(yearSelect).toBeVisible();

        // Fill in the inventory year
        // Locate the select element for inventory year
        const year = page.locator('select[name="year"]');

        // Verify that the select element is visible
        await expect(year).toBeVisible();

        // Select the desired year
        await year.selectOption("2023");

        // Verify that the selection was successful
        await expect(year).toHaveValue("2023");

        // Select inventory goal (only 'gpc_basic' is enabled)
        const inventoryGoalOption = page.locator("label").filter({
          has: page.locator('input[value="gpc_basic"]'),
        });
        await expect(inventoryGoalOption).toHaveCount(1);
        await inventoryGoalOption.click();

        // Select global warming potential (only 'gpc_basic' is enabled)
        const gwpOption = page.locator("label", {
          has: page.locator('input[value="ar6"]'),
        });

        await gwpOption.click();

        const continueButton = page.getByRole("button", { name: /Continue/i });
        await expect(continueButton).toBeEnabled();

        // Click the "Continue" button
        await continueButton.click();

        // Verify that the page navigated to the next step
        const nextStepHeading = page.getByTestId("add-population-data-heading");
        await expect(nextStepHeading).toBeVisible();
      });
    });

    test.describe("Set Population Data Step", () => {
      test.setTimeout(60000);
      test.beforeEach(async ({ page }) => {
        // Navigate through previous steps to reach the Set Population Data Step

        // Navigate to the onboarding setup page
        await page.goto(`/${lng}/onboarding/setup`, {
          waitUntil: "networkidle",
        });

        // Fill in the city input
        const cityInput = page.locator('input[name="city"]');
        await cityInput.click();

        await page.keyboard.type("Chicago", { delay: 100 });

        // Wait for the search results to load
        const citySearchResults = page.getByText(
          /^Chicago\s*United States of America > Illinois$/,
        );
        await citySearchResults.waitFor();

        // Click the city suggestion
        await citySearchResults.click();

        // Click the "Continue" button
        let continueButton = page.getByRole("button", { name: /Continue/i });
        await continueButton.click();

        // Verify that we are on the Set Inventory Details Step
        const inventoryDetailsHeading = page.getByTestId(
          "inventory-details-heading",
        );
        await expect(inventoryDetailsHeading).toBeVisible();

        // Fill in Inventory Details

        // Fill in the inventory year
        const yearSelect = page.locator('select[name="year"]');
        await expect(yearSelect).toBeVisible();
        await yearSelect.selectOption("2023"); // Replace '2023' with an available option

        // Select inventory goal
        const inventoryGoalOption = page.locator("label").filter({
          has: page.locator('input[value="gpc_basic"]'),
        });
        await expect(inventoryGoalOption).toHaveCount(1);
        await inventoryGoalOption.click();

        // Select global warming potential
        const gwpOption = page.locator("label").filter({
          has: page.locator('input[value="ar6"]'),
        });
        await expect(gwpOption).toHaveCount(1);
        await gwpOption.click();

        // Click "Continue" to go to the Set Population Data Step
        continueButton = page.getByRole("button", { name: /Continue/i });
        await expect(continueButton).toBeEnabled();
        await continueButton.click();

        // Verify that we are on the Set Population Data Step
        const stepHeading = page.getByTestId("add-population-data-heading");
        await expect(stepHeading).toBeVisible();
      });
      test("Population data is prepopulated after selecting inventory year", async ({
        page,
      }) => {
        // Country Population Input
        const countryPopulationInput = page.getByPlaceholder(
          "Country population number",
        );
        await expect(countryPopulationInput).toBeVisible();
        await expect(countryPopulationInput).toHaveValue(/^\d{1,3}(,\d{3})*$/);

        // Country Population Source
        const countryPopulationSource = page.getByText(
          "Source: World Population Prospects",
        );
        await expect(countryPopulationSource).toBeVisible();

        // Country Population Year Select
        const countryPopulationYearSelect = page.locator(
          'select[name="countryPopulationYear"]',
        );
        const countryPopulationYearValue =
          await countryPopulationYearSelect.inputValue();
        expect(countryPopulationYearValue).not.toBe("");

        // Region Population Input
        const regionPopulationInput = page.getByPlaceholder(
          "Region or province population number",
        );
        await expect(regionPopulationInput).toBeVisible();
        await expect(regionPopulationInput).toHaveValue(/^\d{1,3}(,\d{3})*$/);

        // Region Population Year Select
        const regionPopulationYearSelect = page.locator(
          'select[name="regionPopulationYear"]',
        );
        const regionPopulationYearValue =
          await regionPopulationYearSelect.inputValue();
        expect(regionPopulationYearValue).not.toBe("");

        // City Population Input
        const cityPopulationInput = page.getByPlaceholder(
          "City population number",
        );
        await expect(cityPopulationInput).toBeVisible();
        await expect(cityPopulationInput).toHaveValue(/^\d{1,3}(,\d{3})*$/);

        // City Population Year Select
        const cityPopulationYearSelect = page.locator(
          'select[name="cityPopulationYear"]',
        );
        const cityPopulationYearValue =
          await cityPopulationYearSelect.inputValue();
        expect(cityPopulationYearValue).not.toBe("");

        // Verify that the "Continue" button is enabled
        const continueButton = page.getByRole("button", { name: /Continue/i });
        await expect(continueButton).toBeEnabled();
      });

      test("User can proceed to the next step with prepopulated population data", async ({
        page,
      }) => {
        // Assuming the population data is prepopulated, we can proceed directly

        // Verify that the "Continue" button is enabled
        const continueButton = page.getByRole("button", { name: /Continue/i });
        await expect(continueButton).toBeEnabled();

        // Click the "Continue" button
        await continueButton.click();
      });
      test("Displays validation errors when population data is cleared", async ({
        page,
      }) => {
        // Clear the country population input
        const cityPopulationInput = page.getByPlaceholder(
          "City population number",
        );
        await cityPopulationInput.fill("");

        // Attempt to click "Continue"
        const continueButton = page.getByRole("button", { name: /Continue/i });
        await continueButton.click();

        // Verify that validation errors are displayed
        const populationError = page
          .getByText(/Please enter value & year for population/i)
          .last();
        await expect(populationError).toBeVisible();
      });
      test("User can edit prepopulated population data and proceed", async ({
        page,
      }) => {
        // Edit the country population input
        const countryPopulationInput = page.getByPlaceholder(
          "Country population number",
        );
        await countryPopulationInput.fill("350,000,000"); // New population value

        // Edit the country population year
        const countryPopulationYearSelect = page.locator(
          'select[name="countryPopulationYear"]',
        );
        await countryPopulationYearSelect.selectOption("2022");

        // Edit the region population input
        const regionPopulationInput = page.getByPlaceholder(
          "Region or province population number",
        );
        await regionPopulationInput.fill("20,000,000");

        // Edit the region population year
        const regionPopulationYearSelect = page.locator(
          'select[name="regionPopulationYear"]',
        );
        await regionPopulationYearSelect.selectOption("2022");

        // Edit the city population input
        const cityPopulationInput = page.getByPlaceholder(
          "City population number",
        );
        await cityPopulationInput.fill("3,000,000");

        // Edit the city population year
        const cityPopulationYearSelect = page.locator(
          'select[name="cityPopulationYear"]',
        );
        await cityPopulationYearSelect.selectOption("2022");

        // Verify that the "Continue" button is still enabled
        const continueButton = page.getByRole("button", { name: /Continue/i });

        // Click the "Continue" button
        await continueButton.click();

        // Verify that the page navigated to the next step
        const nextStepHeading = page.getByTestId("confirm-city-data-heading");
        await expect(nextStepHeading).toBeVisible();
      });
    });
    test.describe("Confirm Step", () => {
      test.setTimeout(60000);
      test.beforeEach(async ({ page }) => {
        // Navigate through previous steps to reach the Confirm Step

        // Navigate to the onboarding setup page
        await page.goto(`/${lng}/onboarding/setup`, {
          waitUntil: "networkidle",
        });

        // Fill in the city input
        const cityInput = page.locator('input[name="city"]');
        await cityInput.click();

        await page.keyboard.type("Chicago", { delay: 100 });

        // Wait for the search results to load
        const citySearchResults = page.getByText(
          /^Chicago\s*United States of America > Illinois$/,
        );
        await citySearchResults.waitFor();

        // Click the city suggestion
        await citySearchResults.click();

        // Click the "Continue" button
        let continueButton = page.getByRole("button", { name: /Continue/i });
        await continueButton.click();

        // Verify that we are on the Set Inventory Details Step
        const inventoryDetailsHeading = page.getByTestId(
          "inventory-details-heading",
        );
        await expect(inventoryDetailsHeading).toBeVisible();

        // Fill in Inventory Details

        // Fill in the inventory year
        const yearSelect = page.locator('select[name="year"]');
        await expect(yearSelect).toBeVisible();
        await yearSelect.selectOption("2023");
        // Select inventory goal
        const inventoryGoalOption = page.locator("label").filter({
          has: page.locator('input[value="gpc_basic"]'),
        });
        await expect(inventoryGoalOption).toHaveCount(1);
        await inventoryGoalOption.click();

        // Select global warming potential
        const gwpOption = page.locator("label").filter({
          has: page.locator('input[value="ar6"]'),
        });
        await expect(gwpOption).toHaveCount(1);
        await gwpOption.click();

        // Click "Continue" to go to the Set Population Data Step
        continueButton = page.getByRole("button", { name: /Continue/i });
        await expect(continueButton).toBeEnabled();
        await continueButton.click();

        // Verify that we are on the Set Population Data Step
        const populationDataHeading = page.getByTestId(
          "add-population-data-heading",
        );
        await expect(populationDataHeading).toBeVisible();
        // Wait for Country Population Input to have a value
        const countryPopulationInput = page.getByPlaceholder(
          "Country population number",
        );
        await expect(countryPopulationInput).toHaveValue(/^\d{1,3}(,\d{3})*$/, {
          timeout: 10000,
        });

        // Wait for Region Population Input to have a value
        const regionPopulationInput = page.getByPlaceholder(
          "Region or province population number",
        );
        await expect(regionPopulationInput).toHaveValue(/^\d{1,3}(,\d{3})*$/, {
          timeout: 10000,
        });

        // Wait for City Population Input to have a value
        const cityPopulationInput = page.getByPlaceholder(
          "City population number",
        );
        await expect(cityPopulationInput).toHaveValue(/^\d{1,3}(,\d{3})*$/, {
          timeout: 10000,
        });

        // Ensure no validation errors are present
        continueButton = page.getByRole("button", { name: /Continue/i });
        await continueButton.click();

        // Verify city heading
        const heading = page.getByTestId("confirm-city-data-heading");
        await expect(heading).toBeVisible();
      });

      test("Confirm Step displays all information correctly", async ({
        page,
      }) => {
        // Verify city heading
        const heading = page.getByTestId("confirm-city-data-heading");
        await expect(heading).toBeVisible();

        // Verify that the city name is displayed
        const cityName = page.getByTestId("confirm-city-data-heading");
        await expect(cityName).toBeVisible();

        const inventoryYear = page.getByTestId("confirm-city-data-year");
        await expect(inventoryYear).toBeVisible();

        const inventoryGoal = page.getByTestId(
          "confirm-city-data-inventory-goal",
        );
        await expect(inventoryGoal).toBeVisible();

        const populationData = page.getByTestId("confirm-city-data-population");
        await expect(populationData).toBeVisible();

        const area = page.getByTestId("confirm-city-data-area");
        await expect(area).toBeVisible();

        const cityMap = page.locator(".pigeon-overlays");
        await expect(cityMap).toBeVisible();
      });

      test("User can complete the onboarding process from Confirm Step", async ({
        page,
      }) => {
        // Click the "Continue" button
        const continueButton = page.getByRole("button", { name: /Continue/i });
        await expect(continueButton).toBeEnabled();
        await continueButton.click();

        const completionMessage = page.getByTestId("done-heading");
        await expect(completionMessage).toBeVisible();

        // Verify that the "Add new inventory" button is present
        const addnewInventoryButton = page.getByTestId("add-new-inventory");
        await expect(addnewInventoryButton).toBeVisible();

        // Verify that the "Add new inventory" button is present
        const checkDashboardButton = page.getByTestId("check-dashboard");
        await expect(checkDashboardButton).toBeVisible();
      });
    });
  });
});
