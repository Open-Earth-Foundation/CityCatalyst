import { APIRequestContext, expect, type Page } from "@playwright/test";

export async function expectText(page: Page, text: string) {
  await expect(page.getByText(text).first()).toBeVisible({ timeout: 10000 });
}

/** Wait until the auth form is hydrated and inputs are interactive. */
export async function waitForAuthFormReady(page: Page) {
  await expect(page.locator('input[name="email"]')).toBeVisible();
  await expect(page.locator("form").first()).toHaveAttribute("novalidate", "");
  const submitButton = page.getByRole("button", {
    name: /^(LOG IN|Create Account)$/i,
  });
  await expect(submitButton).toBeVisible();
  await expect(submitButton).toBeEnabled();
  await expect(submitButton).toHaveAttribute("formnovalidate", "");
}

export async function expectFieldInvalid(page: Page, fieldName: string) {
  await expect(page.locator(`input[name="${fieldName}"]`)).toHaveAttribute(
    "aria-invalid",
    "true",
    { timeout: 15000 },
  );
}

export async function expectValidationMessage(
  page: Page,
  pattern: string | RegExp,
) {
  const locator =
    typeof pattern === "string"
      ? page.getByText(pattern, { exact: false })
      : page.getByText(pattern);
  await expect(locator.first()).toBeVisible({ timeout: 15000 });
}

export async function dismissCookieConsent(page: Page) {
  try {
    await page.getByTestId("cookie-decline-button").waitFor({ timeout: 2000 });
    await page.getByTestId("cookie-decline-button").click();
  } catch {
    // Consent banner not present, continue
  }
}

export async function signup(
  request: APIRequestContext,
  email: string,
  password: string = "Test123",
  confirmPassword: string = "Test123",
  name: string = "Test Account",
  acceptTerms: boolean = true,
) {
  const result = await request.post("/api/v1/auth/register", {
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
  const result = await request.post("/api/v1/inventory", {
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

/**
 * Inventory year for cities onboarding E2E. Uses the previous calendar year so
 * the value stays inside the UI dropdown (current year + 19 prior years) and
 * matches ghgi-onboarding.spec.ts. Call once per flow and pass the return value
 * to assertions so setup and expectations never drift apart.
 */
export function pickE2EOnboardingInventoryYear(): string {
  return String(new Date().getFullYear() - 1);
}

/**
 * Walks the combined cities onboarding wizard (city + inventory + population +
 * third-party data). The flow ends on the newly created inventory page at
 * `/cities/{cityId}/GHGI/{inventoryId}/`.
 *
 * Returns the extracted IDs and the inventory year selected in the wizard.
 */
async function walkCitiesOnboardingWizard(
  page: Page,
): Promise<{ cityId: string; inventoryId: string; inventoryYear: string }> {
  const inventoryYear = pickE2EOnboardingInventoryYear();
  // Step 0: welcome page → click "Get Started"
  await page.goto("/en/cities/onboarding/");

  if (page.url().includes("/auth/login")) {
    throw new Error("Authentication failed - redirected to login page");
  }

  await page.waitForTimeout(500);
  await dismissCookieConsent(page);

  const getStartedButton = page.getByRole("button", { name: /Get Started/i });
  await expect(getStartedButton).toBeVisible();
  await getStartedButton.click();

  // Step 0: select city
  await page.waitForURL("**/cities/onboarding/setup/");

  const cityName = "Chicago";
  const cityInput = page.locator('input[name="city"]');
  await cityInput.click();
  await page.keyboard.type(cityName, { delay: 100 });

  const citySearchResults = page.getByText(
    new RegExp(`^${cityName}\\s*United States of America > Illinois$`),
  );
  await expect(citySearchResults.first()).toBeVisible({ timeout: 30000 });
  await citySearchResults.first().click();

  // Continue (creates the city, advances to inventory details)
  {
    const continueButton = page
      .getByRole("button", { name: /^Continue$/ })
      .last();
    await expect(continueButton).toBeEnabled({ timeout: 30000 });
    await continueButton.click();
  }

  // Step 1: inventory details — goal and GWP are auto-set, only year needed
  await expect(page.getByTestId("inventory-details-heading")).toBeVisible({
    timeout: 15000,
  });

  const yearSelectTrigger = page
    .locator('[data-testid="inventory-details-year"]')
    .locator("button")
    .first();
  await yearSelectTrigger.click();
  await page.waitForTimeout(500);
  await page.getByRole("option", { name: inventoryYear }).click();

  {
    const continueButton = page
      .getByRole("button", { name: /^Continue$/ })
      .last();
    await expect(continueButton).toBeEnabled({ timeout: 30000 });
    await continueButton.click();
  }

  // Step 2: population — pre-filled by OpenClimate query
  await expect(page.getByTestId("add-population-data-heading")).toBeVisible({
    timeout: 15000,
  });

  const cityPopulationInput = page.getByPlaceholder("City population number");
  try {
    await expect(cityPopulationInput).toHaveValue(/^\d{1,3}(,\d{3})*$/, {
      timeout: 10000,
    });
  } catch {
    // OpenClimate pre-fill failed — fill manually
    await cityPopulationInput.fill("1000000");
    await page
      .locator('select[name="cityPopulationYear"]')
      .selectOption(inventoryYear);
    await page.getByPlaceholder("Region population number").fill("5000000");
    await page
      .locator('select[name="regionPopulationYear"]')
      .selectOption(inventoryYear);
    await page.getByPlaceholder("Country population number").fill("10000000");
    await page
      .locator('select[name="countryPopulationYear"]')
      .selectOption(inventoryYear);
  }

  {
    const continueButton = page
      .getByRole("button", { name: /^Continue$/ })
      .last();
    await expect(continueButton).toBeEnabled({ timeout: 30000 });
    await continueButton.click();
  }

  // Step 3: third-party data — opt out for speed/determinism
  await completeThirdPartyDataOnboardingStep(page, "no", {
    waitForInventoryUrl: true,
  });

  // Wizard exits to `/cities/{cityId}/GHGI/{inventoryId}/`
  await page.waitForURL(/\/cities\/[^\/]+\/GHGI\/[^\/]+\/?$/, {
    timeout: 60000,
  });
  const match = page
    .url()
    .match(/\/cities\/([^\/]+)\/GHGI\/([^\/]+)/);
  if (!match) {
    throw new Error(
      "Could not extract cityId and inventoryId from URL after onboarding",
    );
  }
  return { cityId: match[1], inventoryId: match[2], inventoryYear };
}

export async function createCityThroughOnboarding(page: Page): Promise<string> {
  const { cityId } = await walkCitiesOnboardingWizard(page);
  return cityId;
}

/** GHGI setup step: third-party data opt-in (after population, before confirm). */
export async function completeThirdPartyDataOnboardingStep(
  page: Page,
  choice: "yes" | "no" = "no",
  options?: { waitForInventoryUrl?: boolean },
) {
  const step = page.getByTestId("third-party-data-step");
  await expect(step).toBeVisible({ timeout: 10000 });

  const choiceTestId =
    choice === "yes"
      ? "third-party-data-choice-yes"
      : "third-party-data-choice-no";
  await page.getByTestId(choiceTestId).click();

  const continueBtn = page.getByRole("button", { name: /Continue/i });
  await expect(continueBtn).toBeEnabled({ timeout: 15000 });

  if (options?.waitForInventoryUrl) {
    await Promise.all([
      page.waitForURL(/\/cities\/[^/]+\/GHGI\/[^/]+/, { timeout: 60000 }),
      continueBtn.click(),
    ]);
    return;
  }

  await continueBtn.click();
  await page.waitForTimeout(1000);
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
  await page.goto(`/${lng}/cities/${cityId}/GHGI/onboarding`);

  await dismissCookieConsent(page);

  // Step 3: Click "Start Inventory" button
  const startButton = page.getByTestId("start-inventory-button");
  await expect(startButton).toBeVisible();
  await startButton.click();

  // Step 4: Wait for redirect to GHGI onboarding setup
  await page.waitForURL("**/cities/*/GHGI/onboarding/setup/**");

  // Step 5: Set Inventory Details (now in GHGI onboarding setup)
  const inventoryDetailsHeading = page.getByTestId("inventory-details-heading");
  await expect(inventoryDetailsHeading).toBeVisible();

  // Select year - click the select trigger and then select an option
  const yearSelectTrigger = page
    .locator('[data-testid="inventory-details-year"]')
    .locator("button");
  await yearSelectTrigger.click();
  await page.waitForTimeout(500); // Wait for dropdown to open
  const yearOption = page.getByRole("option", { name: "2023" });
  await yearOption.click();

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

  await page.waitForTimeout(2000);

  // Step 6: Set Population Data
  const populationHeading = page.getByTestId("add-population-data-heading");
  await expect(populationHeading).toBeVisible({ timeout: 10000 });

  // Check if population data is populated, if not, fill it manually
  const cityPopulationInput = page.getByPlaceholder("City population number");
  try {
    await expect(cityPopulationInput).toHaveValue(/^\d{1,3}(,\d{3})*$/, {
      timeout: 5000,
    });
  } catch (error) {
    // Fill population data manually
    await cityPopulationInput.fill("1000000"); // 1 million population

    // Fill population year
    const populationYearSelect = page.locator(
      'select[name="cityPopulationYear"]',
    );
    await populationYearSelect.selectOption("2023");

    // Fill region and country data if available
    try {
      const regionPopulationInput = page.getByPlaceholder(
        "Region population number",
      );
      await regionPopulationInput.fill("5000000");

      const regionYearSelect = page.locator(
        'select[name="regionPopulationYear"]',
      );
      await regionYearSelect.selectOption("2023");

      const countryPopulationInput = page.getByPlaceholder(
        "Country population number",
      );
      await countryPopulationInput.fill("10000000");

      const countryYearSelect = page.locator(
        'select[name="countryPopulationYear"]',
      );
      await countryYearSelect.selectOption("2023");
    } catch (e) {
      // Some population fields not found, continuing...
    }
  }

  // Click Continue and wait for data to be submitted also add timeout to allow for data to be submitted
  {
    const continueBtn = page.getByRole("button", { name: /Continue/i });
    await expect(continueBtn).toBeEnabled({ timeout: 30000 });
    await continueBtn.click();
  }

  await page.waitForTimeout(3000);

  await completeThirdPartyDataOnboardingStep(page, "no");

  // Step 8: Confirm and Complete
  const confirmHeading = page.getByTestId("confirm-city-data-heading");
  await expect(confirmHeading).toBeVisible({ timeout: 10000 });

  // Click Continue to complete onboarding
  const continueBtn3 = page.getByRole("button", { name: /Continue/i });
  await expect(continueBtn3).toBeEnabled({ timeout: 10000 });
  await continueBtn3.click();

  // Wait for the form submission to process
  await page.waitForTimeout(5000);

  // Check if we're already on the inventory page (redirect might have happened)
  const currentUrl = page.url();

  if (currentUrl.includes("/GHGI/") && !currentUrl.includes("/onboarding/")) {
    // Already redirected to inventory page
  } else {
    try {
      await page.waitForURL("**/cities/*/GHGI/*/", {
        waitUntil: "domcontentloaded",
        timeout: 15000,
      });
    } catch (error) {
      // Try to manually navigate if redirect failed
      const urlParts = currentUrl.split("/");
      const cityId = urlParts[urlParts.indexOf("cities") + 1];
      await page.goto(`/${lng}/cities/${cityId}/GHGI`);
      throw error;
    }
  }

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
): Promise<{
  page: Page;
  cityId: string;
  inventoryId: string;
  inventoryYear: string;
}> {
  // Cities onboarding now creates both the city and the first inventory in
  // one combined wizard; no need to run the GHGI onboarding flow afterwards.
  const { cityId, inventoryId, inventoryYear } =
    await walkCitiesOnboardingWizard(page);
  return { page, cityId, inventoryId, inventoryYear };
}

export async function createProject(
  request: APIRequestContext,
  name: string,
  description: string,
) {
  const result = await request.post("/api/v1/project", {
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
  await page.waitForLoadState("networkidle");

  // No city yet → run onboarding which lands at /cities/{cityId}/GHGI/{inventoryId}/
  if (page.url().includes("/onboarding/")) {
    await createCityAndInventoryThroughOnboarding(page);
    await page.waitForLoadState("networkidle");
    return;
  }

  // User has a default city - extract it and go straight to the GHGI redirect page,
  // skipping the brittle accordion / module-launch click flow.
  const cityIdMatch = page.url().match(/\/cities\/([^\/]+)/);
  if (!cityIdMatch) {
    const { cityId, inventoryId } =
      await createCityAndInventoryThroughOnboarding(page);
    await page.goto(`/en/cities/${cityId}/GHGI/${inventoryId}/`);
    await page.waitForLoadState("networkidle");
    return;
  }

  const cityId = cityIdMatch[1];
  await page.goto(`/en/cities/${cityId}/GHGI/`);
  await page.waitForLoadState("networkidle");

  // /GHGI redirects to most-recent inventory or to onboarding if none exists
  if (page.url().includes("/GHGI/onboarding")) {
    const { inventoryId } = await createInventoryThroughOnboarding(
      page,
      cityId,
    );
    await page.goto(`/en/cities/${cityId}/GHGI/${inventoryId}/`);
    await page.waitForLoadState("networkidle");
  }
}

export async function navigateToDashboard(page: Page, cityId: string) {
  await page.goto(`/en/cities/${cityId}/dashboard`);
  await page.waitForLoadState("networkidle");
}

export async function navigateToDataPage(
  page: Page,
  cityId: string,
  inventoryId: string,
) {
  await page.goto(`/en/cities/${cityId}/GHGI/${inventoryId}/data/`);
  await page.waitForLoadState("networkidle");
}
