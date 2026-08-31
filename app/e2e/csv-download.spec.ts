import { test, expect, type Page, type Download } from "@playwright/test";
import { parse } from "csv-parse/sync";
import {
  createCityAndInventoryThroughOnboarding,
  dismissCookieConsent,
  dismissToasts,
} from "./helpers";
import * as fs from "fs";

const EXPECTED_CSV_HEADERS = [
  "Inventory Reference",
  "GPC Reference Number",
  "Subsector name",
  "Notation Key",
  "Total Emissions",
  "Total Emission Units",
  "Activity type",
  "Activity Value",
  "Activity Units",
  "Emission Factor - CO2",
  "Emission Factor - CH4",
  "Emission Factor - N2O",
  "Emission Factor - Unit",
  "CO2 Emissions",
  "CH4 Emissions",
  "N2O Emissions",
  "Data source ID",
  "Data source name",
];

async function openDownloadModal(page: Page) {
  await dismissToasts(page);

  const downloadActionCard = page.getByTestId("download-action-card");
  await expect(downloadActionCard).toBeVisible();
  await downloadActionCard.click();

  await expect(page.getByTestId("download-modal-title")).toBeVisible({
    timeout: 10000,
  });
}

async function downloadCsv(page: Page): Promise<Download> {
  const downloadPromise = page.waitForEvent("download");
  const csvDownloadButton = page.getByTestId("download-csv-button");
  await expect(csvDownloadButton).toBeVisible();
  await csvDownloadButton.click();
  return downloadPromise;
}

async function saveDownload(
  download: Download,
  outputPath: string,
): Promise<string> {
  await download.saveAs(outputPath);
  expect(fs.existsSync(outputPath)).toBeTruthy();
  return fs.readFileSync(outputPath, "utf-8");
}

test.describe("CSV Download", () => {
  // All tests share one authenticated admin user and one city/inventory.
  test.describe.configure({ mode: "serial" });
  test.setTimeout(120000);

  let cityId: string;
  let inventoryId: string;

  test.beforeAll(async ({ browser }) => {
    test.setTimeout(180000);

    const context = await browser.newContext({
      storageState: "playwright/.auth/user.json",
    });
    const page = await context.newPage();

    const result = await createCityAndInventoryThroughOnboarding(page);
    cityId = result.cityId;
    inventoryId = result.inventoryId;

    await context.close();
  });

  test.beforeEach(async ({ page }) => {
    await page.goto(`/en/cities/${cityId}/GHGI/${inventoryId}/`);
    await dismissCookieConsent(page);

    const heroCityName = page.getByTestId("hero-city-name");
    await expect(heroCityName).toBeVisible({ timeout: 60000 });
    await expect(heroCityName).toHaveText("Chicago", { timeout: 10000 });

    const addDataCard = page.getByTestId("add-data-to-inventory-card");
    await expect(addDataCard).toBeVisible({ timeout: 60000 });

    const downloadActionCard = page.getByTestId("download-action-card");
    await expect(downloadActionCard).toBeVisible({ timeout: 60000 });
  });

  test("User can download inventory as CSV", async ({ page }, testInfo) => {
    await openDownloadModal(page);

    const download = await downloadCsv(page);
    const downloadPath = testInfo.outputPath("inventory.csv");

    const csvContent = await saveDownload(download, downloadPath);
    expect(csvContent.length).toBeGreaterThan(0);

    const headerLine = csvContent.trim().split("\n")[0];
    const headers = parse(headerLine, { columns: false })[0] as string[];
    expect(headers).toEqual(EXPECTED_CSV_HEADERS);

    expect(download.suggestedFilename()).toMatch(/inventory-.*\.csv/);

    await download.delete();
  });

  test("CSV download contains valid data structure", async ({ page }, testInfo) => {
    await openDownloadModal(page);

    const download = await downloadCsv(page);
    const downloadPath = testInfo.outputPath("inventory-structure.csv");
    const csvContent = await saveDownload(download, downloadPath);

    const records = parse(csvContent, {
      columns: true,
      skip_empty_lines: true,
    });

    if (records.length === 0) {
      expect(csvContent).toContain("Inventory Reference");
    }

    for (const record of records as Record<string, string>[]) {
      if (!record["Notation Key"]) {
        expect(record["GPC Reference Number"]).toBeTruthy();
        expect(record["GPC Reference Number"]).toMatch(/^[IVX]+\.\d+(\.\d+)?$/);
      }

      expect(record["Subsector name"]).toBeTruthy();

      if (record["Total Emissions"]) {
        expect(Number.isNaN(parseFloat(record["Total Emissions"]))).toBe(false);
      }

      if (record["Total Emission Units"]) {
        expect(record["Total Emission Units"]).toMatch(/^t CO2e$/);
      }

      for (const field of [
        "Emission Factor - CO2",
        "Emission Factor - CH4",
        "Emission Factor - N2O",
        "CO2 Emissions",
        "CH4 Emissions",
        "N2O Emissions",
      ]) {
        if (record[field]) {
          expect(Number.isNaN(parseFloat(record[field]))).toBe(false);
        }
      }
    }

    await download.delete();
  });

  test("CSV download handles errors gracefully", async ({ page }) => {
    await page.route("**/api/v1/inventory/**/download?format=csv**", (route) => {
      route.abort("failed");
    });

    await openDownloadModal(page);
    await page.getByTestId("download-csv-button").click();

    await expect(
      page.getByText(/There was an error during download|Download failed/i).first(),
    ).toBeVisible({ timeout: 10000 });
  });

  test("Multiple format downloads work correctly", async ({ page }, testInfo) => {
    await openDownloadModal(page);

    const csvDownload = await downloadCsv(page);
    expect(csvDownload.suggestedFilename()).toContain(".csv");

    const csvPath = testInfo.outputPath("inventory-multi-format.csv");
    const csvContent = await saveDownload(csvDownload, csvPath);
    expect(csvContent).toContain("GPC Reference Number");

    await dismissToasts(page);

    const ecrfDownloadButton = page.getByTestId("download-ecrf-button");
    await expect(ecrfDownloadButton).toBeVisible();

    const ecrfDownloadPromise = page.waitForEvent("download", {
      timeout: 90000,
    });
    await ecrfDownloadButton.click();

    const ecrfDownload = await ecrfDownloadPromise;
    expect(ecrfDownload.suggestedFilename()).toMatch(/\.xlsx?$/);

    await csvDownload.delete();
    await ecrfDownload.delete();
  });

  test("CSV download preserves special characters and formatting", async ({
    page,
  }, testInfo) => {
    await openDownloadModal(page);

    const download = await downloadCsv(page);
    const downloadPath = testInfo.outputPath("inventory-formatting.csv");
    const csvContent = await saveDownload(download, downloadPath);

    expect(csvContent).toMatch(/"[^"]*"/);

    const records = parse(csvContent, {
      columns: true,
      skip_empty_lines: true,
      quote: '"',
    });

    expect(Array.isArray(records)).toBe(true);

    if (records.length === 0) {
      expect(csvContent).toContain("Inventory Reference");
    } else {
      for (const record of records as Record<string, string>[]) {
        for (const value of Object.values(record)) {
          expect(typeof value).toBe("string");
        }
      }
    }

    await download.delete();
  });

  test.skip("CSV download contains actual inventory data", async () => {
    // Full data-entry flow is covered by manual-input.spec.ts.
  });
});
