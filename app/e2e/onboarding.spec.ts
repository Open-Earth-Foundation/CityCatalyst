import { test, expect } from "@playwright/test";

test("should display the onboarding start page", async ({ page }) => {
  const lng = "en";

  //   navigate to the onboarding page
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
  const startButton = page.getByRole("button", { name: /Start inventory/i });
  await expect(startButton).toBeVisible();

  //   Click the "Start Inventory" button
  await startButton.click();

  //   Verify that the page navigates to the setup page
  await expect(page).toHaveURL(`/${lng}/onboarding/setup/`);
});
