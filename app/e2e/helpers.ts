import {
  APIRequestContext,
  expect,
  test,
  type BrowserContext,
  type Locator,
  type Page,
} from "@playwright/test";

export async function expectText(page: Page, text: string) {
  await expect(page.getByText(text).first()).toBeVisible({ timeout: 10000 });
}

/** Wait until the auth form is hydrated and inputs are interactive. */
export async function waitForAuthFormReady(
  page: Page,
  options: { expectEnabled?: boolean } = {},
) {
  const { expectEnabled = true } = options;
  await expect(page.locator('input[name="email"]')).toBeVisible();
  await expect(page.locator("form").first()).toHaveAttribute("novalidate", "");
  const submitButton = page.getByRole("button", {
    name: /^(LOG IN|Create Account)$/i,
  });
  await expect(submitButton).toBeVisible();
  if (expectEnabled) {
    await expect(submitButton).toBeEnabled();
  }
  await expect(submitButton).toHaveAttribute("formnovalidate", "");
}

export async function expectFieldInvalid(page: Page, fieldName: string) {
  // Chakra UI v3 / Ark UI uses several DOM signals to indicate an invalid field:
  //   1. data-invalid="" on the Field.Root group container (role="group")
  //   2. aria-invalid="true" on the input control
  //   3. data-invalid="" on the input control itself
  //   4. An error text element rendered by Field.ErrorText
  // Depending on the Chakra/Ark version, React rendering timing, and how
  // react-hook-form propagates errors, not all signals may be present at the
  // same time. Check for any of them in a polling loop.
  await page.waitForFunction(
    (name: string) => {
      const input = document.querySelector(`input[name="${name}"]`);
      if (!input) return false;

      // Signal 1: aria-invalid on the input itself
      if (input.getAttribute("aria-invalid") === "true") return true;

      // Signal 2: data-invalid on the input itself
      if (input.hasAttribute("data-invalid")) return true;

      // Signal 3: data-invalid on the closest field group container
      const group = input.closest('[role="group"]');
      if (group?.hasAttribute("data-invalid")) return true;

      // Signal 4: an error text element rendered inside the field group
      if (group?.querySelector('[data-part="error-text"]')) return true;

      return false;
    },
    fieldName,
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

/**
 * Pre-decline analytics consent so the fixed cookie banner never renders.
 * With ANALYTICS_ENABLED (release CI) the banner covers bottom-of-viewport
 * controls, especially on mobile viewports.
 */
export async function skipCookieConsent(context: BrowserContext) {
  await context.addInitScript(() => {
    document.cookie = "cc_analytics_consent=false; path=/";
  });
}

/**
 * Dismiss any visible toast notifications so they don't intercept pointer events.
 * Toasts are rendered in a portal at bottom-end and can block button clicks.
 */
export async function dismissToasts(page: Page) {
  // Try to click close buttons on any toasts that have them
  const closeButtons = page.locator('[data-scope="toast"] [data-part="close-trigger"]');
  const count = await closeButtons.count().catch(() => 0);
  for (let i = 0; i < count; i++) {
    await closeButtons.nth(i).click().catch(() => {});
  }
  // Disable pointer-events on all toast group containers so they can't block
  // button clicks even if the toast persists (not all toasts are closable)
  await page.evaluate(() => {
    document.querySelectorAll('[data-part="group"][data-scope="toast"]').forEach((el) => {
      (el as HTMLElement).style.pointerEvents = "none";
    });
  }).catch(() => {});
  // Wait briefly for toasts to clear
  await page.waitForTimeout(500);
}

export async function signup(
  request: APIRequestContext,
  email: string,
  password: string = "Test123",
  confirmPassword: string = "Test123",
  name: string = "Test Account",
  acceptTerms: boolean = true,
) {
  const result = await request.post("/api/v1/auth/register/", {
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

const INVENTORY_YEAR_TAKEN =
  "An inventory for this year already contains data";

/**
 * Real OpenClimate cities. Each onboarding flow takes the next one so
 * parallel Chromium and Firefox runs do not pile activity data onto one
 * Chicago record. The year dropdown only has 20 years, and Continue stays
 * disabled once every year already has data.
 */
const E2E_CITIES: { name: string; region: RegExp }[] = [
  { name: "Houston", region: /United States of America > Texas/ },
  { name: "Phoenix", region: /United States of America > Arizona/ },
  { name: "Philadelphia", region: /United States of America > Pennsylvania/ },
  { name: "San Antonio", region: /United States of America > Texas/ },
  { name: "San Diego", region: /United States of America > California/ },
  { name: "Dallas", region: /United States of America > Texas/ },
  { name: "Austin", region: /United States of America > Texas/ },
  { name: "Jacksonville", region: /United States of America > Florida/ },
  { name: "Columbus", region: /United States of America > Ohio/ },
  { name: "Charlotte", region: /United States of America > North Carolina/ },
  { name: "Indianapolis", region: /United States of America > Indiana/ },
  { name: "Seattle", region: /United States of America > Washington/ },
  { name: "Denver", region: /United States of America > Colorado/ },
  { name: "Boston", region: /United States of America > Massachusetts/ },
  { name: "Nashville", region: /United States of America > Tennessee/ },
  { name: "Detroit", region: /United States of America > Michigan/ },
  { name: "Portland", region: /United States of America > Oregon/ },
  { name: "Memphis", region: /United States of America > Tennessee/ },
  { name: "Baltimore", region: /United States of America > Maryland/ },
  { name: "Milwaukee", region: /United States of America > Wisconsin/ },
  { name: "Albuquerque", region: /United States of America > New Mexico/ },
  { name: "Tucson", region: /United States of America > Arizona/ },
  { name: "Fresno", region: /United States of America > California/ },
  { name: "Sacramento", region: /United States of America > California/ },
  { name: "Atlanta", region: /United States of America > Georgia/ },
  { name: "Miami", region: /United States of America > Florida/ },
  { name: "Minneapolis", region: /United States of America > Minnesota/ },
  { name: "Cleveland", region: /United States of America > Ohio/ },
  { name: "New Orleans", region: /United States of America > Louisiana/ },
  { name: "Chicago", region: /United States of America > Illinois/ },
];

let nextCitySlot = 0;

function nextE2ECity(): { name: string; region: RegExp } {
  const workers = Math.max(test.info().config.workers || 1, 1);
  const index =
    (test.info().parallelIndex + nextCitySlot * workers) % E2E_CITIES.length;
  nextCitySlot += 1;
  return E2E_CITIES[index];
}

/**
 * Pick a dropdown year whose Continue button stays enabled.
 * A fresh city can use the first year. This still skips a year that already
 * has activity data when two flows land on the same city.
 */
export async function selectAvailableInventoryYear(page: Page): Promise<string> {
  const trigger = page
    .locator('[data-testid="inventory-details-year"]')
    .locator("button");
  await trigger.click();
  const options = page.getByRole("option");
  await expect(options.first()).toBeVisible();
  const years = (await options.allInnerTexts())
    .map((text) => text.trim())
    .filter((text) => /^\d{4}$/.test(text));
  await page.keyboard.press("Escape");

  const continueBtn = page.getByRole("button", { name: /Continue/i });
  const taken = page.getByText(INVENTORY_YEAR_TAKEN);

  for (const year of years) {
    await trigger.click();
    await page.getByRole("option", { name: year, exact: true }).click();
    if (await inventoryYearIsAvailable(page, continueBtn, taken)) return year;
  }

  throw new Error(
    "Every inventory year in the dropdown already has activity data",
  );
}

async function inventoryYearIsAvailable(
  page: Page,
  continueBtn: Locator,
  taken: Locator,
): Promise<boolean> {
  const started = Date.now();
  let enabledSince: number | null = null;
  while (Date.now() - started < 15000) {
    if (await taken.isVisible()) return false;
    if (await continueBtn.isEnabled()) {
      if (enabledSince == null) enabledSince = Date.now();
      else if (Date.now() - enabledSince >= 1500) return true;
    } else {
      enabledSince = null;
    }
    await page.waitForTimeout(200);
  }
  return false;
}

/**
 * Walks the city onboarding wizard (city select + invite collaborators).
 * Creating a city no longer creates an inventory as part of this flow --
 * the wizard ends on `/cities/onboarding/done`. See
 * createCityAndInventoryThroughOnboarding to also create the first
 * inventory via the separate GHGI onboarding flow.
 *
 * Returns the created city's ID.
 */
export async function selectCityFromOnboardingSearch(
  page: Page,
  cityName: string,
  regionPath: RegExp = /United States of America > Illinois/,
) {
  const cityInput = page.locator('input[name="city"]');
  await expect(cityInput).toBeVisible({ timeout: 30000 });
  await cityInput.click();
  await cityInput.fill(cityName);

  await page
    .waitForResponse(
      (resp) =>
        resp.url().includes("search/city") &&
        resp.request().method() === "GET" &&
        resp.ok(),
      { timeout: 30000 },
    )
    .catch(() => {
      // Search may be served from cache on repeat runs.
    });

  const cityResult = page
    .locator(".group")
    .filter({ has: page.getByText(cityName, { exact: true }) })
    .filter({ hasText: regionPath })
    .first();

  await expect(cityResult).toBeVisible({ timeout: 30000 });
  await cityResult.click();

  await expect(page.getByTestId("selected-city-name")).toHaveText(
    new RegExp(cityName, "i"),
    { timeout: 30000 },
  );
}

async function walkCitiesOnboardingWizard(
  page: Page,
): Promise<{ cityId: string; cityName: string }> {
  // Step 0: welcome page → click "Get started"
  await page.goto("/en/cities/onboarding/");
  await page.waitForLoadState("domcontentloaded");

  if (page.url().includes("/auth/login")) {
    throw new Error("Authentication failed - redirected to login page");
  }

  await page.waitForTimeout(500);
  await dismissCookieConsent(page);

  await expect(page.getByTestId("start-page-title")).toBeVisible({
    timeout: 60000,
  });

  const getStartedButton = page.getByTestId("start-inventory-button");
  await expect(getStartedButton).toBeVisible({ timeout: 30000 });
  // The cookie banner can appear after the first dismiss and cover this button.
  try {
    await getStartedButton.click({ timeout: 15000 });
  } catch {
    await dismissCookieConsent(page);
    await getStartedButton.click();
  }

  // Step 0: select city
  await page.waitForURL("**/cities/onboarding/setup/");

  const city = nextE2ECity();
  await selectCityFromOnboardingSearch(page, city.name, city.region);

  // Continue (creates the city, advances to invite collaborators)
  {
    const continueButton = page
      .getByRole("button", { name: /^Continue$/ })
      .last();
    await expect(continueButton).toBeEnabled({ timeout: 30000 });
    await continueButton.click();
  }

  // Step 1: invite collaborators — skip for speed/determinism
  await expect(page.getByTestId("invite-collaborators-step")).toBeVisible({
    timeout: 15000,
  });
  await page.getByRole("button", { name: /Skip this step/i }).click();

  // Wizard exits to `/cities/onboarding/done?...&cityId=...`
  await page.waitForURL(/\/cities\/onboarding\/done/, { timeout: 30000 });
  const cityId = new URL(page.url()).searchParams.get("cityId");
  if (!cityId) {
    throw new Error("Could not extract cityId from URL after onboarding");
  }
  return { cityId, cityName: city.name };
}

export async function createCityThroughOnboarding(page: Page): Promise<string> {
  const { cityId } = await walkCitiesOnboardingWizard(page);
  return cityId;
}

/** GHGI setup step: third-party data opt-in (final step before inventory is created). */
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

  const continueBtn = page.getByRole("button", {
    name: /Create Inventory|Continue/i,
  });
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
): Promise<{ page: Page; inventoryId: string; inventoryYear: string }> {
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

  // Step 3: Select "Create a new inventory" and continue
  await expect(page.getByTestId("start-page-heading")).toBeVisible({
    timeout: 30000,
  });
  await page.getByTestId("create-inventory-option").click();
  const startContinueButton = page.getByTestId("continue-button");
  await expect(startContinueButton).toBeEnabled({ timeout: 15000 });
  await startContinueButton.click();

  // Step 4: Wait for redirect to GHGI onboarding setup
  await page.waitForURL("**/cities/*/GHGI/onboarding/setup/**");

  // Step 5: Set Inventory Details (now in GHGI onboarding setup)
  const inventoryDetailsHeading = page.getByTestId("inventory-details-heading");
  await expect(inventoryDetailsHeading).toBeVisible();

  // Skip years that already have activity data. Continue stays disabled for those.
  const inventoryYear = await selectAvailableInventoryYear(page);

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
  } catch {
    // Fill population data manually
    await cityPopulationInput.fill("1000000"); // 1 million population

    // Fill population year
    const populationYearSelect = page.locator(
      'select[name="cityPopulationYear"]',
    );
    await populationYearSelect.selectOption(inventoryYear);

    // Fill region and country data if available
    try {
      const regionPopulationInput = page.getByPlaceholder(
        "Region or province population number",
      );
      await regionPopulationInput.fill("5000000");

      const regionYearSelect = page.locator(
        'select[name="regionPopulationYear"]',
      );
      await regionYearSelect.selectOption(inventoryYear);

      const countryPopulationInput = page.getByPlaceholder(
        "Country population number",
      );
      await countryPopulationInput.fill("10000000");

      const countryYearSelect = page.locator(
        'select[name="countryPopulationYear"]',
      );
      await countryYearSelect.selectOption(inventoryYear);
    } catch {
      // Some population fields not found, continuing...
    }
  }

  // Click Continue and wait for data to be submitted also add timeout to allow for data to be submitted
  {
    // Dismiss any toast notifications that may block the Continue button
    await dismissToasts(page);

    const continueBtn = page.getByRole("button", { name: /Continue/i });
    await expect(continueBtn).toBeEnabled({ timeout: 30000 });
    await continueBtn.click();
  }

  await page.waitForTimeout(3000);

  await completeThirdPartyDataOnboardingStep(page, "no", {
    waitForInventoryUrl: true,
  });

  // completeThirdPartyDataOnboardingStep's own waitForURL uses a loose
  // pattern that already matches the current .../GHGI/onboarding/setup/
  // URL, so it can resolve before the click's navigation actually lands.
  // Wait again here with an end-anchored pattern to make sure we've truly
  // reached the final .../GHGI/{inventoryId}/ page.
  await page.waitForURL(/\/cities\/[^\/]+\/GHGI\/[^\/]+\/?$/, {
    timeout: 60000,
  });

  // Extract inventoryId from the final URL
  const finalUrl = page.url();
  const inventoryIdMatch = finalUrl.match(/\/cities\/[^\/]+\/GHGI\/([^\/]+)/);
  if (!inventoryIdMatch) {
    throw new Error("Could not extract inventoryId from final URL");
  }
  const inventoryId = inventoryIdMatch[1];

  // Return both the page and inventoryId
  return { page, inventoryId, inventoryYear };
}

export async function createCityAndInventoryThroughOnboarding(
  page: Page,
): Promise<{
  page: Page;
  cityId: string;
  cityName: string;
  inventoryId: string;
  inventoryYear: string;
}> {
  // City onboarding no longer creates an inventory (CC-612): create the
  // city first, then run the separate GHGI onboarding flow for the
  // inventory. Each call uses a different city so the shared 20-year
  // dropdown is not already full of activity data.
  const { cityId, cityName } = await walkCitiesOnboardingWizard(page);
  const { inventoryId, inventoryYear } = await createInventoryThroughOnboarding(
    page,
    cityId,
  );
  return { page, cityId, cityName, inventoryId, inventoryYear };
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
