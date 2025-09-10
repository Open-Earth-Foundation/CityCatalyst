import { test, expect } from "@playwright/test";
import {
  createCityThroughOnboarding,
} from "./helpers";

test("Inventory Onboarding", async ({ page }) => {
  const cityId = await createCityThroughOnboarding(page, "Chicago");
  await page.goto(`/en/cities/${cityId}/GHGI/onboarding`);
  /** "should display the inventory onboarding start page" */
  {
    //   Verify the title of the page is correct
    await expect(page).toHaveTitle(/CityCatalyst/i);

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
    const startButton = page.getByTestId("start-inventory-button");
    await expect(startButton).toBeVisible();

    //   Click the "Start Inventory" button
    await startButton.click();
  }
  /** "Set Inventory Details step displays correctly" */
  {
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

    // Select inventory goal
    const inventoryGoalOption = page.getByTestId("inventory-goal-gpc_basic");
    await expect(inventoryGoalOption).toBeVisible();
    await expect(inventoryGoalOption).toHaveText("GPC BASIC");
    await inventoryGoalOption.click();

    // Select global warming potential
    const gwpOption = page.getByTestId("inventory-goal-ar6");
    await expect(gwpOption).toBeVisible();
    await expect(gwpOption).toHaveText("ar6");
    await gwpOption.click();

    const continueButton = page.getByRole("button", { name: /Continue/i });
    await expect(continueButton).toBeEnabled();

    // Click the "Continue" button
    await continueButton.click();
  }

  const countryPopulationInput = page.getByPlaceholder(
    "Country population number",
  );

  const regionPopulationInput = page.getByPlaceholder(
    "Region or province population number",
  );

  const cityPopulationInput = page.getByPlaceholder("City population number");

  /** "Population data is prepopulated after selecting inventory year" */
  {
    // Navigate through previous steps to reach the Set Population Data Step

    // Verify that we are on the Set Population Data Step
    const populationDataHeading = page.getByTestId("add-population-data-heading");
    await expect(populationDataHeading).toBeVisible();
    // Wait for Country Population Input to have a value

    await expect(countryPopulationInput).toHaveValue(/^\d{1,3}(,\d{3})*$/, {
      timeout: 10000,
    });

    // Country Population Source
    const countryPopulationSource = page.getByText(
      "Source: World Population Prospects",
    );
    await expect(countryPopulationSource).toBeVisible();

    // Wait for Region Population Input to have a value
    await expect(regionPopulationInput).toHaveValue(/^\d{1,3}(,\d{3})*$/, {
      timeout: 10000,
    });

    // Wait for City Population Input to have a value
    await expect(cityPopulationInput).toHaveValue(/^\d{1,3}(,\d{3})*$/, {
      timeout: 10000,
    });
    // Verify that the "Continue" button is enabled
    const continueButton = page.getByRole("button", { name: /Continue/i });
    await expect(continueButton).toBeEnabled();
  }

  /** "Displays validation errors when population data is cleared" */
  {
    // Clear the country population input
    await cityPopulationInput.fill("");

    // Attempt to click "Continue"
    const continueButton = page.getByRole("button", { name: /Continue/i });
    await continueButton.click();

    // Verify that validation errors are displayed
    const populationError = page
      .getByText(/Please enter value & year for population/i)
      .last();
    await expect(populationError).toBeVisible();
  }
  /** "User can edit prepopulated population data and proceed" */
  {
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
  }

  /** "Confirm Step displays all information correctly" */
  {
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

    const cityMap = page.locator(".pigeon-overlays");
    await expect(cityMap).toBeVisible();
  }

  /** "User can complete the onboarding process from Confirm Step" */
  {
    // Click the "Continue" button
    const continueButton = page.getByRole("button", { name: /Continue/i });
    await expect(continueButton).toBeEnabled();

    await continueButton.click();
  }
});

