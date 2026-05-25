import { test, expect } from "@playwright/test";
import {
  completeThirdPartyDataOnboardingStep,
  dismissCookieConsent,
} from "./helpers";

test("City Onboarding", async ({ page }) => {
  test.setTimeout(120000);

  /** "should display the onboarding start page" */
  {
    await page.goto(`/en/cities/onboarding/`);

    await expect(page).toHaveTitle(/CityCatalyst/i);

    const startPageTitle = page.getByTestId(/start-page-title/i);
    await expect(startPageTitle).toHaveText("Welcome to CityCatalyst");

    const mainHeading = page.getByTestId(/start-page-heading/i);
    await expect(mainHeading).toHaveText(
      /Let's start with information about your city/i,
    );

    const description = page.getByTestId(/start-page-description/i);
    await expect(description).toHaveText(
      /In this step, choose a city to include in your project and provide relevant details that wil be used later./i,
    );

    await dismissCookieConsent(page);

    const startButton = page.getByRole("button", { name: /Get Started/i });
    await expect(startButton).toBeVisible();
    await startButton.click();
  }

  /** "Step 1 – Select city" */
  {
    await page.waitForURL("**/cities/onboarding/setup/");

    const cityInput = page.locator('input[name="city"]');
    await cityInput.click();
    await page.keyboard.type("Chicago", { delay: 100 });

    const citySearchResults = page.getByText(
      /^Chicago\s*United States of America > Illinois$/,
    );
    await citySearchResults.waitFor();
    await citySearchResults.click();

    // Selected-city card should show the city name and area (with loader resolving)
    await expect(page.getByTestId("selected-city-name")).toHaveText(/Chicago/i);
    await expect(page.getByTestId("selected-city-area")).toBeVisible({
      timeout: 30000,
    });

    const continueButton = page
      .getByRole("button", { name: /^Continue$/ })
      .last();
    await expect(continueButton).toBeEnabled({ timeout: 30000 });
    await continueButton.click();
  }

  /** "Step 2 – Inventory details" */
  {
    await expect(page.getByTestId("inventory-details-heading")).toBeVisible({
      timeout: 15000,
    });

    const yearSelectTrigger = page
      .locator('[data-testid="inventory-details-year"]')
      .locator("button")
      .first();
    await yearSelectTrigger.click();
    await page.waitForTimeout(500);
    const inventoryYear = String(new Date().getFullYear());
    await page.getByRole("option", { name: inventoryYear }).click();

    // Goal and global warming potential are pre-selected by the step
    await expect(page.getByTestId("inventory-goal-gpc_basic")).toBeVisible();
    await expect(page.getByTestId("inventory-goal-ar6")).toBeVisible();

    const continueButton = page
      .getByRole("button", { name: /^Continue$/ })
      .last();
    await expect(continueButton).toBeEnabled({ timeout: 30000 });
    await continueButton.click();
  }

  /** "Step 3 – Population data is pre-populated" */
  {
    await expect(page.getByTestId("add-population-data-heading")).toBeVisible({
      timeout: 15000,
    });

    const cityPopulationInput = page.getByPlaceholder("City population number");
    await expect(cityPopulationInput).toHaveValue(/^\d{1,3}(,\d{3})*$/, {
      timeout: 15000,
    });

    const continueButton = page
      .getByRole("button", { name: /^Continue$/ })
      .last();
    await expect(continueButton).toBeEnabled({ timeout: 30000 });
    await continueButton.click();
  }

  /** "Step 4 – Third-party data opt-out completes onboarding" */
  {
    await completeThirdPartyDataOnboardingStep(page, "no");

    // Wizard exits onto the newly created inventory page
    await page.waitForURL(/\/en\/cities\/[a-f0-9-]+\/GHGI\/[a-f0-9-]+\/?$/, {
      timeout: 30000,
    });
  }
});
