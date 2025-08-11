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
      await page.goto("/");

      // Verify Dashboard
      await page.waitForLoadState("networkidle");
      // Verify page title
      await expect(page).toHaveTitle(/CityCatalyst/i);

      // Verify project name is displayed
      const projectName = page.getByTestId("hero-project-name");
      await expect(projectName).toHaveText("Default Project");

      // Verify city name is displayed
      const cityName = page.getByTestId("hero-city-name");
      await expect(cityName).toHaveText("Chicago");

      // Verify inventory year title is displayed
      const inventoryYearTitle = page.getByTestId("inventory-year-title");
      await expect(inventoryYearTitle).toHaveText("Inventory year");

      // Note: Add inventory button is only visible for ORG_ADMIN and PROJECT_ADMIN users
      // Test user is now an Admin (Roles.Admin), so the button should be visible
      const addNewInventoryButton = page.getByTestId(
        "add-new-inventory-button",
      );
      await expect(addNewInventoryButton).toBeVisible();

      const inventoryYearValue = page.getByTestId("inventory-year");
      await expect(inventoryYearValue).toBeVisible();
      await expect(inventoryYearValue).toHaveText("2023");

      const lastInventoryUpdated = page.getByTestId("inventory-last-updated");
      await expect(lastInventoryUpdated).toBeVisible();

      const InventoryCalculationTab = page.getByTestId(
        "tab-emission-inventory-calculation-title",
      );
      await expect(InventoryCalculationTab).toHaveText("Inventory calculation");

      const EmissionsInventoryResultsTab = page.getByTestId(
        "tab-emission-inventory-results-title",
      );
      await expect(EmissionsInventoryResultsTab).toHaveText(
        "Emission inventory results",
      );

      const SectorDataTitle = page.getByTestId("sector-data-title");
      await expect(SectorDataTitle).toHaveText("Sector Emissions");

      const StationaryEnergy = page.getByTestId("stationary-energy");
      await expect(StationaryEnergy).toHaveText("Stationary energy");
    });
  });
});
