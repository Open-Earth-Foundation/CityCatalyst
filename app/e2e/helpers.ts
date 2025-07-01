import { APIRequestContext, expect, type Page } from "@playwright/test";

export async function expectText(page: Page, text: string) {
  await expect(page.getByText(text).first()).toBeVisible();
}

export async function signup(
  request: APIRequestContext,
  email: string,
  password: string = "Test123",
  confirmPassword: string = "Test123",
  name: string = "Test Account",
  acceptTerms: boolean = true,
) {
  const result = await request.post("/api/v0/auth/register", {
    data: {
      email,
      password,
      confirmPassword,
      name,
      acceptTerms,
    },
  });
  expect(result.ok()).toBeTruthy();
  return await result.json();
}

export async function createInventory(
  request: APIRequestContext,
  name: string,
  description: string,
  sector: string,
  subsector: string,
  methodology: string,
) {
  const result = await request.post("/api/v0/inventory", {
    data: {
      name,
      description,
      sector,
      subsector,
      methodology,
    },
  });
  expect(result.ok()).toBeTruthy();
  return await result.json();
}

export async function createInventoryThroughOnboarding(
  page: Page,
  cityName: string = "Chicago",
) {
  // Step 1: Start the onboarding process
  await page.goto("/onboarding/");

  // Click "Start Inventory" button
  const startButton = page.getByRole("button", { name: /Start inventory/i });
  await expect(startButton).toBeVisible();
  await startButton.click();

  // Step 2: Select City
  await page.waitForURL("**/onboarding/setup/");

  // Fill in the city input
  const cityInput = page.locator('input[name="city"]');
  await cityInput.click();
  await page.keyboard.type(cityName, { delay: 100 });

  // Wait for and click the city suggestion
  const citySearchResults = page.getByText(
    new RegExp(`^${cityName}\\s*United States of America > Illinois$`),
  );
  await citySearchResults.waitFor();
  await citySearchResults.click();

  // Click Continue
  const continueButton = page.getByRole("button", { name: /Continue/i });
  await continueButton.click();

  // Step 3: Set Inventory Details
  const inventoryDetailsHeading = page.getByTestId("inventory-details-heading");
  await expect(inventoryDetailsHeading).toBeVisible();

  // Select year
  const yearSelect = page.locator('select[name="year"]');
  await yearSelect.selectOption("2023");

  // Select inventory goal
  const inventoryGoalOption = page.getByTestId("inventory-goal-gpc_basic");
  await inventoryGoalOption.click();

  // Select global warming potential
  const gwpOption = page.getByTestId("inventory-goal-ar6");
  await gwpOption.click();

  // Click Continue
  await page.getByRole("button", { name: /Continue/i }).click();

  // Step 4: Set Population Data
  const populationHeading = page.getByTestId("add-population-data-heading");
  await expect(populationHeading).toBeVisible();

  //set timeout to allow for population data to be populated
  await page.waitForTimeout(10000);

  // Verify population data is populated before proceeding
  const cityPopulationInput = page.getByPlaceholder("City population number");
  await expect(cityPopulationInput).toHaveValue(/^\d{1,3}(,\d{3})*$/, {
    timeout: 15000,
  });

  // Log the population values for debugging
  const cityPopulationValue = await cityPopulationInput.inputValue();
  console.log("City Population Value:", cityPopulationValue);

  const regionPopulationInput = page.getByPlaceholder(
    "Region or province population number",
  );
  const regionPopulationValue = await regionPopulationInput.inputValue();
  console.log("Region Population Value:", regionPopulationValue);

  const countryPopulationInput = page.getByPlaceholder(
    "Country population number",
  );
  const countryPopulationValue = await countryPopulationInput.inputValue();
  console.log("Country Population Value:", countryPopulationValue);

  // Click Continue and wait for data to be submitted also add timeout to allow for data to be submitted
  await page.getByRole("button", { name: /Continue/i }).click();

  // Step 5: Confirm and Complete
  const confirmHeading = page.getByTestId("confirm-city-data-heading");
  await expect(confirmHeading).toBeVisible();

  // Click Continue to complete onboarding
  await page.getByRole("button", { name: /Continue/i }).click();

  // wait until data is submitting after clicking continue
  await page.waitForLoadState("networkidle");

  // Step 6: Verify completion page
  const completionMessage = page.getByTestId("done-heading");
  await expect(completionMessage).toBeVisible();
  // Return the completion page for further navigation
  return page;
}

export async function createProject(
  request: APIRequestContext,
  name: string,
  description: string,
) {
  const result = await request.post("/api/v0/project", {
    data: {
      name,
      description,
    },
  });
  expect(result.ok()).toBeTruthy();
  return await result.json();
}
