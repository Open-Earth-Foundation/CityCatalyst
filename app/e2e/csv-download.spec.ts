import { test, expect } from "@playwright/test";
import { createInventoryThroughOnboarding } from "./helpers";
import { parse } from "csv-parse/sync";
import * as fs from "fs";

test.describe("CSV Download", () => {
  test.setTimeout(180000); // Set 60 second timeout for all tests in this describe block

  test("User can download inventory as CSV", async ({ page }) => {
    // Create inventory through onboarding
    await createInventoryThroughOnboarding(page, "Chicago");

    // Navigate to Dashboard
    await page.waitForLoadState("networkidle");

    // Verify we're on the dashboard
    await expect(page.getByTestId("hero-city-name")).toHaveText("Chicago");

    // Find and click the Download button
    // Looking for the download action card
    const downloadActionCard = page.getByTestId("download-action-card");
    await expect(downloadActionCard).toBeVisible();
    await downloadActionCard.click();

    // Wait for the download modal to appear
    const downloadModal = page.getByRole("dialog");
    await expect(downloadModal).toBeVisible();

    // Start waiting for download before clicking
    const downloadPromise = page.waitForEvent("download");

    // Click on CSV download button
    const csvDownloadButton = page.getByTestId("download-csv-button");
    await expect(csvDownloadButton).toBeVisible();
    await csvDownloadButton.click();

    // Wait for the download to complete
    const download = await downloadPromise;

    // Verify download filename
    const filename = download.suggestedFilename();
    expect(filename).toMatch(/inventory-.*\.csv/);
    expect(filename).toContain(".csv");

    // Save the downloaded file to a temporary location for verification
    const downloadPath = await download.path();
    expect(downloadPath).toBeTruthy();

    // Read and verify the CSV content
    const csvContent = fs.readFileSync(downloadPath!, "utf-8");
    expect(csvContent).toBeTruthy();
    expect(csvContent.length).toBeGreaterThan(0);

    // Parse CSV to get headers
    const lines = csvContent.trim().split("\n");
    expect(lines.length).toBeGreaterThan(0); // Should have at least header line

    // Parse the header line to get column names
    const headerLine = lines[0];
    const headers = parse(headerLine, { columns: false })[0];

    // Verify expected headers are present
    const expectedHeaders = [
      "Inventory Reference",
      "GPC Reference Number",
      "Subsector name",
      "Total Emissions",
      "Activity type",
      "Data source name",
    ];

    for (const expectedHeader of expectedHeaders) {
      expect(headers).toContain(expectedHeader);
    }

    // Clean up - delete the downloaded file
    await download.delete();
  });

  test("CSV download contains valid data structure", async ({ page }) => {
    // Create inventory through onboarding
    await createInventoryThroughOnboarding(page, "Chicago");

    // Navigate to Dashboard
    await page.waitForLoadState("networkidle");

    // Open download modal
    const downloadActionCard = page.getByTestId("download-action-card");
    await downloadActionCard.click();

    // Wait for modal
    const downloadModal = page.getByRole("dialog");
    await expect(downloadModal).toBeVisible();

    // Download CSV
    const downloadPromise = page.waitForEvent("download");
    const csvDownloadButton = page.getByTestId("download-csv-button");
    await csvDownloadButton.click();

    const download = await downloadPromise;
    const downloadPath = await download.path();

    // Parse and validate CSV content
    const csvContent = fs.readFileSync(downloadPath!, "utf-8");
    const records = parse(csvContent, {
      columns: true,
      skip_empty_lines: true,
    });

    // Validate data types and structure for each row (only if records exist)
    if (records.length === 0) {
      expect(csvContent).toContain("Inventory Reference"); // At least headers should be present
    }

    for (const record of records) {
      // Check that GPC Reference Number is present (unless it's a notation key row)
      if (!record["Notation Key"]) {
        expect(record["GPC Reference Number"]).toBeTruthy();
        expect(record["GPC Reference Number"]).toMatch(/^[IVX]+\.\d+(\.\d+)?$/);
      }

      // Check subsector name is present
      expect(record["Subsector name"]).toBeTruthy();

      // If there are emissions, verify they are numeric or empty
      if (record["Total Emissions"]) {
        const totalEmissions = parseFloat(record["Total Emissions"]);
        expect(isNaN(totalEmissions)).toBe(false);
      }

      // Verify emission units format
      if (record["Total Emission Units"]) {
        expect(record["Total Emission Units"]).toMatch(/^t CO2e$/);
      }

      // Verify emission factors are numeric if present
      const emissionFactorFields = [
        "Emission Factor - CO2",
        "Emission Factor - CH4",
        "Emission Factor - N2O",
      ];

      for (const field of emissionFactorFields) {
        if (record[field] && record[field] !== "") {
          const value = parseFloat(record[field]);
          expect(isNaN(value)).toBe(false);
        }
      }

      // Verify emissions are numeric if present
      const emissionFields = [
        "CO2 Emissions",
        "CH4 Emissions",
        "N2O Emissions",
      ];

      for (const field of emissionFields) {
        if (record[field] && record[field] !== "") {
          const value = parseFloat(record[field]);
          expect(isNaN(value)).toBe(false);
        }
      }
    }

    // Clean up
    await download.delete();
  });

  test("CSV download handles errors gracefully", async ({ page }) => {
    // Create inventory through onboarding
    await createInventoryThroughOnboarding(page, "Chicago");

    // Navigate to Dashboard
    await page.waitForLoadState("networkidle");

    // Open download modal
    const downloadActionCard = page.getByTestId("download-action-card");
    await downloadActionCard.click();

    // Mock network error for CSV download endpoint
    await page.route(
      "**/api/v0/inventory/**/download?format=csv**",
      (route) => {
        route.abort("failed");
      },
    );

    // Wait for modal
    const downloadModal = page.getByRole("dialog");
    await expect(downloadModal).toBeVisible();

    // Attempt CSV download
    const csvDownloadButton = page.getByTestId("download-csv-button");
    await csvDownloadButton.click();

    // Verify error toast appears
    await page.waitForTimeout(1000); // Give time for toast to appear
    const errorToast = page.getByText(/download.*failed|error/i).first();
    await expect(errorToast).toBeVisible({ timeout: 5000 });
  });

  test("Multiple format downloads work correctly", async ({ page }) => {
    // Create inventory through onboarding
    await createInventoryThroughOnboarding(page, "Chicago");

    // Navigate to Dashboard
    await page.waitForLoadState("networkidle");

    // Open download modal
    const downloadActionCard = page.getByTestId("download-action-card");
    await downloadActionCard.click();

    const downloadModal = page.getByRole("dialog");
    await expect(downloadModal).toBeVisible();

    // Test CSV download
    const csvDownloadPromise = page.waitForEvent("download");
    const csvDownloadButton = page.getByTestId("download-csv-button");
    await csvDownloadButton.click();

    const csvDownload = await csvDownloadPromise;
    expect(csvDownload.suggestedFilename()).toContain(".csv");

    // Verify CSV content
    const csvPath = await csvDownload.path();
    const csvContent = fs.readFileSync(csvPath!, "utf-8");
    expect(csvContent).toContain("GPC Reference Number");

    // Test eCRF download (if available)
    const ecrfDownloadButton = page.getByTestId("download-ecrf-button");
    if (await ecrfDownloadButton.isVisible()) {
      const ecrfDownloadPromise = page.waitForEvent("download");
      await ecrfDownloadButton.click();

      const ecrfDownload = await ecrfDownloadPromise;
      expect(ecrfDownload.suggestedFilename()).toMatch(/\.xlsx?$/);

      // Clean up
      await ecrfDownload.delete();
    }

    // Clean up CSV download
    await csvDownload.delete();
  });

  test("CSV download preserves special characters and formatting", async ({
    page,
  }) => {
    // Create inventory through onboarding
    await createInventoryThroughOnboarding(page, "Chicago");

    // Navigate to Dashboard
    await page.waitForLoadState("networkidle");

    // Open download modal and download CSV
    const downloadActionCard = page.getByTestId("download-action-card");
    await downloadActionCard.click();

    const downloadModal = page.getByRole("dialog");
    await expect(downloadModal).toBeVisible();

    const downloadPromise = page.waitForEvent("download");
    const csvDownloadButton = page.getByTestId("download-csv-button");
    await csvDownloadButton.click();

    const download = await downloadPromise;
    const downloadPath = await download.path();

    // Read raw CSV content to check formatting
    const csvContent = fs.readFileSync(downloadPath!, "utf-8");

    // Verify CSV is properly quoted (all fields should be quoted as per the service)
    expect(csvContent).toMatch(/"[^"]*"/); // Check for quoted fields

    // Parse CSV and verify data integrity
    const records = parse(csvContent, {
      columns: true,
      skip_empty_lines: true,
      quote: '"',
    });

    // Verify parsing was successful
    expect(records).toBeDefined();
    expect(Array.isArray(records)).toBe(true);

    // Check that no data corruption occurred (only if records exist)
    if (records.length === 0) {
      expect(csvContent).toContain("Inventory Reference");
    } else {
      for (const record of records as any[]) {
        // Verify no undefined or null values in unexpected places
        for (const [key, value] of Object.entries(record)) {
          expect(typeof value).toBe("string"); // CSV values are strings
        }
      }
    }

    // Clean up
    await download.delete();
  });

  test("CSV download contains actual inventory data", async ({ page }) => {
    // Create inventory through onboarding
    await createInventoryThroughOnboarding(page, "Chicago");

    // Navigate to Dashboard
    await page.waitForLoadState("networkidle");

    // Navigate to Add Data section
    const addDataButton = page.getByTestId("add-data-to-inventory-card");
    await expect(addDataButton).toBeVisible({ timeout: 15000 });
    await addDataButton.click();

    // Verify we're on the data entry page
    await expect(page.getByTestId("add-data-step-title")).toBeVisible();

    // Click on Stationary Energy sector
    const stationaryEnergyCard = page.getByTestId(
      "stationary-energy-sector-card",
    );
    await expect(stationaryEnergyCard).toBeVisible();

    const sectorButton = stationaryEnergyCard.getByTestId("sector-card-button");
    await sectorButton.click();

    // Wait for subsector page to load
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(2000); // Give time for subsectors to load

    // Select first available subsector
    const subsectorCards = page.getByTestId("subsector-card");
    const subsectorCount = await subsectorCards.count();
    expect(subsectorCount).toBeGreaterThan(0);

    const firstSubsector = subsectorCards.first();
    await firstSubsector.click();

    // Wait for methodology page to load
    await page.waitForLoadState("networkidle");
    await page.waitForTimeout(3000);

    // Look for methodology cards first, preferring "Direct Measure"
    const methodologyCards = page.getByTestId("methodology-card");
    const methodologyCount = await methodologyCards.count();

    // Try to find a methodology card with "Direct Measure" text
    let selectedMethodology;
    for (let i = 0; i < methodologyCount; i++) {
      const card = methodologyCards.nth(i);
      const cardText = await card.textContent();
      if (cardText && cardText.toLowerCase().includes("direct measure")) {
        selectedMethodology = card;
        break;
      }
    }

    // If no direct measure found, use first available
    if (!selectedMethodology && methodologyCount > 0) {
      selectedMethodology = methodologyCards.first();
    }

    if (selectedMethodology && (await selectedMethodology.isVisible())) {
      // Click the selected methodology card
      await selectedMethodology.click();

      await page.waitForLoadState("networkidle");
      await page.waitForTimeout(2000);

      // Then look for "Add emission data" button
      const addEmissionButton = page.getByTestId("add-emission-data-button");
      await expect(addEmissionButton).toBeVisible();
      await addEmissionButton.click();
    } else {
      // If no methodology cards, click emissions button directly
      const addEmissionButton = page.getByTestId("add-emission-data-button");
      await addEmissionButton.click();
    }

    // Fill in the emission data form
    const modal = page.getByTestId("add-emission-modal");
    await expect(modal).toBeVisible();

    // Fill in required dropdowns
    const selects = page.locator("select");
    const selectCount = await selects.count();

    for (let i = 0; i < selectCount; i++) {
      const select = selects.nth(i);
      const optionCount = await select.locator("option").count();
      if (optionCount > 1) {
        await select.selectOption({ index: 1 }); // Select first non-default option
      }
    }

    // Fill in text inputs
    const textInputs = page.locator("input[type='text']");
    const inputCount = await textInputs.count();

    for (let i = 0; i < inputCount; i++) {
      const input = textInputs.nth(i);
      const placeholder = await input.getAttribute("placeholder");

      if (placeholder?.includes("activity") || placeholder?.includes("value")) {
        await input.fill("100"); // Test activity value
      } else {
        await input.fill("test-value");
      }
    }

    // Fill source reference
    const sourceInput = modal.getByTestId("source-reference");
    if (await sourceInput.isVisible()) {
      await sourceInput.fill("E2E Test Data Source");
    }

    // Fill emission factors if visible
    const co2Input = modal.getByTestId("co2-emission-factor");
    if (await co2Input.isVisible()) {
      await co2Input.fill("2.5"); // Test CO2 emission factor
    }

    const ch4Input = modal.getByTestId("ch4-emission-factor");
    if (await ch4Input.isVisible()) {
      await ch4Input.fill("0.1"); // Test CH4 emission factor
    }

    const n2oInput = modal.getByTestId("n2o-emission-factor");
    if (await n2oInput.isVisible()) {
      await n2oInput.fill("0.05"); // Test N2O emission factor
    }

    // Submit the form
    const submitButton = modal.getByTestId("add-emission-modal-submit");
    await submitButton.click();

    // Wait for form submission
    await page.waitForTimeout(3000);

    // Navigate back to dashboard to download CSV
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // Download CSV with the added data
    const downloadActionCard = page.getByTestId("download-action-card");
    await downloadActionCard.click();

    const downloadModal = page.getByRole("dialog");
    await expect(downloadModal).toBeVisible();

    const downloadPromise = page.waitForEvent("download");
    const csvDownloadButton = page.getByTestId("download-csv-button");
    await csvDownloadButton.click();

    const download = await downloadPromise;
    const downloadPath = await download.path();

    // Parse and validate CSV contains our test data
    const csvContent = fs.readFileSync(downloadPath!, "utf-8");
    const records = parse(csvContent, {
      columns: true,
      skip_empty_lines: true,
    });

    console.log(records);

    // Verify we have data records (not just headers)
    expect(records.length).toBeGreaterThan(0);

    // Look for our test data in the CSV - must find exact match
    const testDataRecord = records.find(
      (record: any) => record["Data source name"] === "test-value",
    );

    // Verify our test data is actually in the CSV
    expect(testDataRecord).toBeTruthy();
    expect(testDataRecord["Subsector name"]).toBe("Residential buildings");
    expect(testDataRecord["GPC Reference Number"]).toBe("I.1.1");
    expect(testDataRecord["Total Emissions"]).toBe("18.55");
    expect(testDataRecord["Data source name"]).toBe("test-value");

    // Clean up
    await download.delete();
  });
});
