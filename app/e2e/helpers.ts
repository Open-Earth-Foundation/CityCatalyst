import { APIRequestContext, expect, type Page } from "@playwright/test";

export async function expectText(page: Page, text: string) {
  await page.waitForTimeout(500);
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
      preferredLanguage: "en",
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

export async function createCityThroughOnboarding(
  page: Page,
): Promise<string> {
  // Step 1: Start the city onboarding process
  await page.goto("/en/cities/onboarding/");

  // Wait a moment for any animations to settle
  await page.waitForTimeout(500);

  // Click "Get Started" button to start city selection
  const getStartedButton = page.getByRole("button", { name: /Get Started/i });
  await expect(getStartedButton).toBeVisible();
  await getStartedButton.click();

  // Step 2: Select City
  await page.waitForURL("**/cities/onboarding/setup/");

  const cityName = "Chicago";
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

  // Click Continue to complete city selection
  {
    const continueButton = page.getByRole("button", { name: /Continue/i });
    await expect(continueButton).toBeEnabled({ timeout: 30000 });
    await continueButton.click();
}
  // Click Continue to confirm
  {
    const continueButton = page.getByRole("button", { name: /Continue/i });
    await expect(continueButton).toBeEnabled({ timeout: 30000 });
    await continueButton.click();
  }
  // Step 3: Wait for redirect to city page and extract cityId from URL
  await page.waitForURL("**/cities/*/");
  const url = page.url();
  const cityIdMatch = url.match(/\/cities\/([^\/]+)/);
  if (!cityIdMatch) {
    throw new Error("Could not extract cityId from URL after city selection");
  }
  const cityId = cityIdMatch[1];

  return cityId;
}

export async function createInventoryThroughOnboarding(
  page: Page,
  cityId?: string,
): Promise<{ page: Page; inventoryId: string }> {
  // If no cityId provided, we assume we're already on a city page
  if (!cityId) {
    // Extract cityId from current URL
    const url = page.url();
    const cityIdMatch = url.match(/\/cities\/([^\/]+)/);
    if (!cityIdMatch) {
      throw new Error("Could not extract cityId from current URL");
    }
    cityId = cityIdMatch[1];
  }
  const lng = "en";
  await page.goto(`/${lng}/cities/${cityId}/GHGI/onboarding`)

  // Step 3: Click "Start Inventory" button
  const startButton = page.getByTestId("start-inventory-button");
  await expect(startButton).toBeVisible();
  await startButton.click();

  // Step 4: Wait for redirect to GHGI onboarding setup
  await page.waitForURL("**/cities/*/GHGI/onboarding/setup/**");

  // Step 5: Set Inventory Details (now in GHGI onboarding setup)
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
  {
    const continueBtn = page.getByRole("button", { name: /Continue/i });
    await expect(continueBtn).toBeEnabled({ timeout: 30000 });
    await continueBtn.click();
  }

  await page.waitForTimeout(5000);

  // Step 6: Set Population Data
  const populationHeading = page.getByTestId("add-population-data-heading");
  await expect(populationHeading).toBeVisible();

  // Verify population data is populated before proceeding
  const cityPopulationInput = page.getByPlaceholder("City population number");
  await expect(cityPopulationInput).toHaveValue(/^\d{1,3}(,\d{3})*$/, {
    timeout: 15000,
  });

  // Click Continue and wait for data to be submitted also add timeout to allow for data to be submitted
  {
    const continueBtn = page.getByRole("button", { name: /Continue/i });
    await expect(continueBtn).toBeEnabled({ timeout: 30000 });
    await continueBtn.click();
  }

  // Step 7: Confirm and Complete
  const confirmHeading = page.getByTestId("confirm-city-data-heading");
  await expect(confirmHeading).toBeVisible();

  // Click Continue to complete onboarding
  const continueBtn3 = page.getByRole("button", { name: /Continue/i });
  await expect(continueBtn3).toBeEnabled({ timeout: 30000 });
  await continueBtn3.click();

  // wait until data is submitting after clicking continue
  await page.waitForLoadState("networkidle");

  // Wait for redirect to the inventory dashboard
  await page.waitForURL("**/cities/*/GHGI/*/");

  // Extract inventoryId from the final URL
  const finalUrl = page.url();
  const inventoryIdMatch = finalUrl.match(/\/cities\/[^\/]+\/GHGI\/([^\/]+)/);
  if (!inventoryIdMatch) {
    throw new Error("Could not extract inventoryId from final URL");
  }
  const inventoryId = inventoryIdMatch[1];

  // Return both the page and inventoryId
  return { page, inventoryId };
}

export async function createCityAndInventoryThroughOnboarding(
  page: Page,
): Promise<{ page: Page; cityId: string; inventoryId: string }> {
  // Create the city first
  const cityId = await createCityThroughOnboarding(page);
  
  // Then create the inventory
  const { page: inventoryPage, inventoryId } = await createInventoryThroughOnboarding(page, cityId);
  
  // Return both IDs and the page
  return { page: inventoryPage, cityId, inventoryId };
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
/**
 * Navigates to the GHGI module for a given city, if the city does not exist, it will create it through onboarding
 * @param page - The page object
 */
export async function navigateToGHGIModule(page: Page) {
  await page.goto("/en/cities/");
  
  // Check if we were redirected to onboarding page (no cities exist)
  const currentUrl = page.url();
  if (currentUrl.includes("/onboarding/")) {
    // Complete the full onboarding flow
    await createCityAndInventoryThroughOnboarding(page);
    
    // Now try to navigate to cities again
    await page.goto("/en/cities/");
  }
  
  await page.getByRole("button", { name: "Assess and Analyze" }).click();
  await page.getByLabel("Assess and Analyze").getByText("Launch").click();
  
}

/** Navigates to GHGI module for the default city.
 * If the city does not exist, it creates it through onboarding. */
export async function navigateToGHGIModule(
  page: Page,
  cityName: string = "Chicago",
) {
  await page.goto("/en/cities/");

  // Check if we were redirected to onboarding page (no cities exist)
  const currentUrl = page.url();
  if (currentUrl.includes("/onboarding/")) {
    // Complete the full onboarding flow
    await createInventoryThroughOnboarding(page, cityName);

    // Now navigate to dashboard
    await page.goto("/en/cities/");
  }
  // Open the GHGI module
  await page.getByRole("button", { name: "Assess and Analyze" }).click();
  await page.getByLabel("Assess and Analyze").getByText("Launch").click();
}
