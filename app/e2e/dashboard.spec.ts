import { test, expect } from "@playwright/test";
import { createInventoryThroughOnboarding } from "./helpers";

test.describe("Dashboard", () => {
  test.describe("Dashboard with Inventory", () => {
    test("User can complete onboarding and access dashboard", async ({
      page,
    }) => {
      // Create inventory through onboarding
      await createInventoryThroughOnboarding(page, "Chicago");

      // Navigate to Dashboard
      const checkDashboardButton = page.getByTestId("check-dashboard");
      await expect(checkDashboardButton).toBeVisible();
      await checkDashboardButton.click();

      // Verify Dashboard
      await page.waitForLoadState("networkidle");

      // Verify page title
      await expect(page).toHaveTitle(/CityCatalyst/i);

      // Verify city name is displayed
      const cityName = page.getByTestId("hero-city-name");
      await expect(cityName).toBeVisible();
      await expect(cityName).toHaveText("Chicago");

      // Verify inventory year is displayed
      const inventoryYear = page.getByTestId("inventory-year");
      await expect(inventoryYear).toBeVisible();
      await expect(inventoryYear).toHaveText("2023");

      // Verify inventory goal is displayed
      const inventoryGoal = page.getByTestId("inventory-goal");
      await expect(inventoryGoal).toBeVisible();
      await expect(inventoryGoal).toHaveText("GPC BASIC");

      // Verify GWP is displayed
      const gwp = page.getByTestId("gwp");
      await expect(gwp).toBeVisible();
      await expect(gwp).toHaveText("AR6");
    });

    test("Dashboard displays inventory progress correctly", async ({
      page,
    }) => {
      // Create inventory through onboarding
      await createInventoryThroughOnboarding(page, "Chicago");

      // Navigate to dashboard
      await page.getByTestId("check-dashboard").click();

      // Now test dashboard functionality
      await page.waitForLoadState("networkidle");

      // Verify progress indicators are present
      const progressSection = page.getByTestId("inventory-progress");
      await expect(progressSection).toBeVisible();

      // Verify sectors are displayed
      const sectors = page.getByTestId("sectors-list");
      await expect(sectors).toBeVisible();

      // Verify total emissions display
      const totalEmissions = page.getByTestId("total-emissions");
      await expect(totalEmissions).toBeVisible();

      // Verify navigation elements
      const navigation = page.getByTestId("main-navigation");
      await expect(navigation).toBeVisible();
    });
  });

  test.describe("Dashboard without Inventory", () => {
    test("Dashboard shows empty state when no inventory exists", async ({
      page,
    }) => {
      // Navigate directly to dashboard without creating inventory
      await page.goto("/");
      await page.waitForLoadState("networkidle");

      // Verify empty state is displayed
      const emptyState = page.getByTestId("empty-state");
      await expect(emptyState).toBeVisible();

      // Verify "Create Inventory" button is present
      const createInventoryButton = page.getByTestId("create-inventory-button");
      await expect(createInventoryButton).toBeVisible();
      await expect(createInventoryButton).toHaveText(/Create Inventory/i);
    });
  });
});
