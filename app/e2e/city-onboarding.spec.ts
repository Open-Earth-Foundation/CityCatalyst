import { test, expect } from "@playwright/test";
import {
  createCityThroughOnboarding,
} from "./helpers";

test("City Onboarding", async ({ page }) => {
  /** "should display the onboarding start page" */
  {
    // Navigate to start page before each test
    await page.goto(`/en/cities/onboarding/`);

    //   Verify the title of the page is correct
    await expect(page).toHaveTitle(/CityCatalyst/i);

    //   check that the heading with data-testid="start-page-title" has the correct text
    const startPageTitle = page.getByTestId(/start-page-title/i);
    await expect(startPageTitle).toHaveText("Welcome to CityCatalyst");

    //   Check that the main heading is present and has the correct text
    const mainHeading = page.getByTestId(/start-page-heading/i);
    await expect(mainHeading).toHaveText(
      /Let's start with information about your city/i,
    );

    //   Check that the description is present and has the correct text
    const description = page.getByTestId(/start-page-description/i);
    await expect(description).toHaveText(
      /In this step, choose a city to include in your project and provide relevant details that wil be used later./i,
    );

    //   Verify the "Get Started" button is present and clickable
    const startButton = page.getByRole("button", { name: /Get Started/i });
    await expect(startButton).toBeVisible();

    //   Click the "Get Started" button
    await startButton.click();
  }

  /** "should allow user to select a city and proceed to the confirmation" */
  {
    // Wait for city selection page
    await page.waitForURL("**/cities/onboarding/setup/");

    // Fill in the city input
    const cityInput = page.locator('input[name="city"]');
    await cityInput.click();
    await page.keyboard.type("Chicago", { delay: 100 });

    // Wait for and click the city suggestion
    const citySearchResults = page.getByText(
      /^Chicago\s*United States of America > Illinois$/,
    );
    await citySearchResults.waitFor();
    await citySearchResults.click();
    test.setTimeout(60000);

    let continueButton = page
      .getByRole("button", { name: /^Continue$/ })
      .last();

    await expect(continueButton).toBeEnabled({ timeout: 30000 });
    await continueButton.click();
    test.setTimeout(60000);
  }

  /** "Confirm Step displays all information correctly" */
  {
    // Verify city heading
    const heading = page.getByTestId("confirm-city-data-heading");
    await expect(heading).toBeVisible();

    const area = page.getByTestId("confirm-city-data-area");
    await expect(area).toBeVisible();

    const cityMap = page.locator(".pigeon-overlays");
    await expect(cityMap).toBeVisible();
  }

  /** "User can complete the onboarding process from Confirm Step" */
  {
    // Click the "Continue" button
    const continueButton = page.getByRole("button", { name: /Continue/i });
    await expect(continueButton).toBeEnabled();
    await continueButton.click();
    await page.waitForLoadState("networkidle");
    // Expect to be on the city page
    await expect(page).toHaveURL(/\/en\/cities\/[a-f0-9-]+\/?$/);
  }
});

