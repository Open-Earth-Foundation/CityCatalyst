import { test, expect } from "@playwright/test";
import { createCityAndInventoryThroughOnboarding } from "./helpers";

test.describe("Dashboard", () => {
  test.describe("Dashboard with Inventory", () => {
    test("User can complete onboarding and access dashboard", async ({
      page,
    }) => {
      test.setTimeout(180000);

      // Create inventory through onboarding
      const { cityId, inventoryYear } =
        await createCityAndInventoryThroughOnboarding(page);
      await page.goto(`/en/cities/${cityId}/GHGI`);
      // Verify Dashboard
      await page.waitForLoadState("networkidle");
      // Verify page title
      await expect(page).toHaveTitle(/CityCatalyst/i);

      // Verify project name is displayed
      const projectName = page.getByTestId("hero-project-name");
      await expect(projectName).toHaveText("CityCatalyst Demo");

      // Verify city name is displayed
      const cityName = page.getByTestId("hero-city-name");
      await expect(cityName).toHaveText("Chicago");

      // Verify inventory year title is displayed
      const inventoryYearTitle = page.getByTestId("inventory-year-title");
      await expect(inventoryYearTitle).toHaveText("Inventory year");

      // Note: Add inventory button is only visible for ORG_ADMIN and PROJECT_ADMIN users
      // Test user is now an admin user, so the button should be visible
      const addNewInventoryButton = page.getByTestId(
        "add-new-inventory-button",
      );
      await expect(addNewInventoryButton).toBeVisible({ timeout: 10000 });

      // YearSelector renders one card per inventory; duplicate years are possible in E2E.
      const inventoryYearValue = page
        .getByTestId("inventory-year")
        .filter({ hasText: inventoryYear })
        .first();
      await expect(inventoryYearValue).toBeVisible({ timeout: 10000 });
      await expect(inventoryYearValue).toHaveText(inventoryYear);

      const lastInventoryUpdated = page
        .getByTestId("inventory-last-updated")
        .first();
      await expect(lastInventoryUpdated).toBeVisible({ timeout: 10000 });

      const InventoryCalculationTab = page.getByTestId(
        "tab-emission-inventory-calculation-title",
      );
      await expect(InventoryCalculationTab).toHaveText(
        "Inventory calculation",
        {
          timeout: 10000,
        },
      );

      const EmissionsInventoryResultsTab = page.getByTestId(
        "tab-emission-inventory-results-title",
      );
      await expect(EmissionsInventoryResultsTab).toHaveText(
        "Emission inventory results",
        { timeout: 10000 },
      );

      const SectorDataTitle = page.getByTestId("sector-data-title");
      await expect(SectorDataTitle).toHaveText("Sector Emissions", {
        timeout: 10000,
      });

      const StationaryEnergy = page.getByTestId("stationary-energy");
      await expect(StationaryEnergy).toHaveText("Stationary energy", {
        timeout: 10000,
      });
    });
  });
});
