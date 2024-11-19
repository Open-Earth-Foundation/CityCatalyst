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

      //   Verify that the page navigates to the setup page
      await expect(page).toHaveURL(`/${lng}/onboarding/setup/`);
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

    test("User can select and proceed to the next step", async ({ page }) => {
      // Fill in the city input
      const cityInput = page.getByTestId("setup-city-input");
      await cityInput.fill("Chicago");

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
  });
});
