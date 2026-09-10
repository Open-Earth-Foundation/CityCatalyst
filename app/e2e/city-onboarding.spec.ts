import { test, expect } from "@playwright/test";
import { dismissCookieConsent, selectCityFromOnboardingSearch } from "./helpers";

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

    await selectCityFromOnboardingSearch(page, "Chicago");

    await expect(page.getByTestId("selected-city-area")).toBeVisible({
      timeout: 30000,
    });

    const continueButton = page
      .getByRole("button", { name: /^Continue$/ })
      .last();
    await expect(continueButton).toBeEnabled({ timeout: 30000 });
    await continueButton.click();
  }

  /** "Step 2 – Invite collaborators (skip) completes onboarding" */
  {
    await expect(page.getByTestId("invite-collaborators-step")).toBeVisible({
      timeout: 15000,
    });
    await page.getByRole("button", { name: /Skip this step/i }).click();

    // Wizard exits onto the "all set up" done screen -- city onboarding no
    // longer creates an inventory as part of this flow (CC-612).
    await page.waitForURL(/\/cities\/onboarding\/done/, { timeout: 30000 });
    await expect(page.getByTestId("done-heading")).toBeVisible({
      timeout: 15000,
    });
  }
});
