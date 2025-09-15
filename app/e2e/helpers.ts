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
  console.log("Starting navigateToGHGIModule...");
  
  await page.goto("/en/cities/");
  console.log("Navigated to /en/cities/, current URL:", page.url());
  
  await page.waitForLoadState("networkidle");
  
  // Check if we were redirected to onboarding page (no cities exist)
  const currentUrl = page.url();
  console.log("Current URL after waiting for network idle:", currentUrl);
  
  if (currentUrl.includes("/onboarding/")) {
    console.log("Redirected to onboarding, creating city and inventory...");
    // Complete the full onboarding flow
    await createCityAndInventoryThroughOnboarding(page);
    
    // Now try to navigate to cities again
    await page.goto("/en/cities/");
    await page.waitForLoadState("networkidle");
    console.log("After onboarding, navigated back to cities, URL:", page.url());
  }

  const inventoryUrlRegex = /\/cities\/[^/]+\/GHGI\/[^/]+\/?$/;
  const ghgiRootRegex = /\/cities\/[^/]+\/GHGI\/?$/;

  // Attempt up to 3 times in case the click doesn't navigate
  for (let attempt = 1; attempt <= 3; attempt++) {
    console.log(`GHGI navigation attempt ${attempt}...`);

    console.log("Looking for 'Assess and Analyze' button...");
    const assessButton = page.getByRole("button", { name: "Assess and Analyze" });
    const assessButtonCount = await assessButton.count();
    console.log("Found 'Assess and Analyze' button count:", assessButtonCount);
    if (assessButtonCount === 0) {
      console.log("ERROR: 'Assess and Analyze' button not found!");
      throw new Error("'Assess and Analyze' button not found on cities page");
    }

    await Promise.all([
      page.waitForLoadState("networkidle").catch(() => {}),
      assessButton.click(),
    ]);
    console.log("Clicked 'Assess and Analyze' button, URL:", page.url());

    console.log("Looking for GHGI module launch button...");
    const moduleButton = page.getByTestId('module-launch-077690c6-6fa3-44e1-84b7-6d758a6a4d88');
    const moduleButtonCount = await moduleButton.count();
    console.log("Found GHGI module launch button count:", moduleButtonCount);
    if (moduleButtonCount === 0) {
      console.log("ERROR: GHGI module launch button not found!");
      throw new Error("GHGI module launch button not found");
    }

    await Promise.all([
      // Wait for either a URL change or network idle after clicking
      page.waitForLoadState("networkidle").catch(() => {}),
      page.waitForURL(/\/cities\//, { timeout: 15000 }).catch(() => {}),
      moduleButton.click(),
    ]);
    console.log("URL after module launch click:", page.url());

    // If we reached an inventory page -> success
    if (inventoryUrlRegex.test(page.url())) {
      console.log("Reached GHGI inventory URL:", page.url());
      return;
    }

    // If we are at GHGI root -> wait for client redirect
    if (ghgiRootRegex.test(page.url())) {
      console.log("At GHGI root without inventoryId. Waiting for redirect to inventory or onboarding...");
      const redirectStart = Date.now();
      let redirected = false;
      while (Date.now() - redirectStart < 30000) {
        console.log("Waiting for redirect from GHGI root. Current URL:", page.url());
        await page.waitForLoadState("networkidle");
        const u = page.url();
        if (inventoryUrlRegex.test(u)) {
          console.log("Redirected to inventory URL:", u);
          redirected = true;
          return;
        }
        if (u.includes("/GHGI/onboarding")) {
          console.log("Redirected to GHGI onboarding:", u);
          redirected = true;
          return;
        }
        await page.waitForTimeout(500);
      }
      console.log("Timed out waiting for redirect from GHGI root. Current URL:", page.url());
      // fallthrough to retry
    }

    // If we are back on /en/cities/ or elsewhere, retry
    console.log("Not on GHGI page yet. Current URL:", page.url());
    await page.goto("/en/cities/");
    await page.waitForLoadState("networkidle");
  }

  // Final log if all attempts failed
  console.log("Failed to navigate to GHGI inventory after retries. Final URL:", page.url());
  throw new Error("Failed to navigate to GHGI inventory page");
}

