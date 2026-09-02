import { test, expect, type Page, type Locator } from "@playwright/test";
import { parse } from "csv-parse/sync";
import {
  createCityAndInventoryThroughOnboarding,
  dismissCookieConsent,
  dismissToasts,
  navigateToDataPage,
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

type DownloadResult = {
  filename: string;
  content: Buffer;
};

async function openDownloadModal(page: Page) {
  await dismissToasts(page);

  const downloadActionCard = page.getByTestId("download-action-card");
  await expect(downloadActionCard).toBeVisible();
  await downloadActionCard.click();

  await expect(page.getByTestId("download-modal-title")).toBeVisible({
    timeout: 10000,
  });
}

async function selectDownloadFormat(page: Page, format: "csv" | "ecrf") {
  const checkbox = page.getByTestId(`download-${format}-checkbox`);
  await expect(checkbox).toBeVisible({ timeout: 10000 });
  await checkbox.click();
  await expect(page.getByTestId("download-confirm-button")).toBeEnabled({
    timeout: 10000,
  });
}

async function confirmDownload(page: Page) {
  const confirmButton = page.getByTestId("download-confirm-button");
  await expect(confirmButton).toBeEnabled();
  await confirmButton.click();
}

async function triggerDownloadFromModal(page: Page, format: "csv" | "ecrf") {
  await selectDownloadFormat(page, format);
  await confirmDownload(page);
}

function filenameFromDisposition(
  contentDisposition: string,
  fallback: string,
): string {
  const match = contentDisposition.match(/filename="(.+)"/);
  return match?.[1] ?? fallback;
}

async function fetchDownloadViaApi(
  page: Page,
  inventoryId: string,
  format: "csv" | "ecrf",
): Promise<DownloadResult> {
  const response = await page.request.get(
    `/api/v1/inventory/${inventoryId}/download?format=${format}&lng=en`,
  );
  expect(response.ok()).toBeTruthy();

  const content = Buffer.from(await response.body());
  expect(content.byteLength).toBeGreaterThan(0);

  return {
    filename: filenameFromDisposition(
      response.headers()["content-disposition"] ?? "",
      `inventory.${format === "csv" ? "csv" : "xlsx"}`,
    ),
    content,
  };
}

async function downloadCsv(page: Page, inventoryId: string) {
  await triggerDownloadFromModal(page, "csv");
  return fetchDownloadViaApi(page, inventoryId, "csv");
}

async function downloadEcrf(page: Page, inventoryId: string) {
  await triggerDownloadFromModal(page, "ecrf");
  return fetchDownloadViaApi(page, inventoryId, "ecrf");
}

function saveDownloadContent(
  content: Buffer,
  outputPath: string,
  encoding: BufferEncoding = "utf-8",
): string {
  fs.writeFileSync(outputPath, content);
  expect(fs.existsSync(outputPath)).toBeTruthy();
  return content.toString(encoding);
}

async function openResidentialSubsector(
  page: Page,
  cityId: string,
  inventoryId: string,
) {
  await page.goto(`/en/cities/${cityId}/GHGI/${inventoryId}/data/1/`);
  await expect(
    page.getByRole("heading", { name: /Stationary energy/i }),
  ).toBeVisible({ timeout: 30000 });

  const residentialCard = page
    .getByTestId("subsector-card")
    .filter({ hasText: /Residential/i });
  await expect(residentialCard.first()).toBeVisible({ timeout: 30000 });
  await residentialCard.first().click();
  await page.waitForURL(new RegExp(`/GHGI/${inventoryId}/data/1/[^/]+`));

  await expect(page.getByText(/I\.1.*Residential/i)).toBeVisible({
    timeout: 30000,
  });
}

function addActivityButton(page: Page, panel?: Locator) {
  const button = page.getByLabel("activity-button");
  return panel ? panel.getByLabel("activity-button") : button.first();
}

async function ensureMethodologySelected(page: Page, panel?: Locator) {
  const addActivity = addActivityButton(page, panel);
  if (await addActivity.isVisible({ timeout: 3000 }).catch(() => false)) {
    return;
  }

  const methodologyCards = panel
    ? panel.getByTestId("methodology-card")
    : page.getByTestId("methodology-card");
  const fuelCombustionCard = methodologyCards
    .filter({ hasText: /Fuel Consumption/i })
    .first();
  await expect(fuelCombustionCard).toBeVisible({ timeout: 30000 });
  await fuelCombustionCard.click();

  await expect(addActivity).toBeVisible({ timeout: 30000 });
}

async function fillCustomEmissionFactors(addEmissionModal: Locator) {
  await addEmissionModal
    .getByLabel(/Select emission factor type/i)
    .selectOption("custom");
  await addEmissionModal.getByLabel("CO2 emission factor").fill("10");
  await addEmissionModal.getByLabel("N2O emission factor").fill("10");
  await addEmissionModal.getByLabel("CH4 emission factor").fill("1");
  await addEmissionModal.getByLabel(/Data Quality/i).selectOption("high");
  await addEmissionModal.getByLabel("Data source").fill("test");
  await addEmissionModal.getByLabel("Explanatory comments").fill("test");
}

function openScopePanel(page: Page, scope: 1 | 2) {
  return page
    .locator('[role="tabpanel"][data-state="open"]')
    .or(page.getByRole("tabpanel", { name: new RegExp(`Scope ${scope}`, "i") }))
    .first();
}

async function addScope1ResidentialEmissions(
  page: Page,
  cityId: string,
  inventoryId: string,
) {
  await navigateToDataPage(page, cityId, inventoryId);

  await expect(
    page.getByText("Add Data to Complete Your GHG Inventory"),
  ).toBeVisible();
  const stationaryEnergyCard = page.getByTestId(
    "stationary-energy-sector-card",
  );
  const sectorDataUrlGlob = `**/cities/${cityId}/GHGI/${inventoryId}/data/1/`;
  await Promise.all([
    page.waitForURL(sectorDataUrlGlob),
    stationaryEnergyCard.getByTestId("sector-card-button").click(),
  ]);
  await expect(
    page.getByRole("heading", { name: /Stationary energy/i }),
  ).toBeVisible({ timeout: 30000 });

  await openResidentialSubsector(page, cityId, inventoryId);
  await page.getByRole("tab", { name: /Scope 1/i }).click();

  const scopeOnePanel = openScopePanel(page, 1);
  await expect(scopeOnePanel).toBeVisible({ timeout: 30000 });
  const hasExistingActivity = await scopeOnePanel
    .getByText(/Propane/i)
    .isVisible()
    .catch(() => false);
  if (hasExistingActivity) {
    return;
  }

  await ensureMethodologySelected(page, scopeOnePanel);

  await addActivityButton(page, scopeOnePanel).click();
  const addEmissionModal = page.getByTestId("add-emission-modal");
  await expect(addEmissionModal).toBeVisible();

  await addEmissionModal
    .getByLabel(/Building type/i)
    .selectOption("building-type-all");
  await addEmissionModal
    .getByLabel(/Fuel type/i)
    .selectOption("fuel-type-propane");
  await addEmissionModal.getByLabel("Total fuel consumption").fill("100");
  await addEmissionModal
    .getByLabel(/Select Unit/i)
    .selectOption("units-cubic-meters");
  await fillCustomEmissionFactors(addEmissionModal);

  await addEmissionModal.getByTestId("add-emission-modal-submit").click();
  await expect(addEmissionModal).not.toBeVisible({ timeout: 30000 });
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
    await page.goto(`/en/cities/${cityId}/GHGI/${inventoryId}/`, {
      waitUntil: "domcontentloaded",
    });
    await dismissCookieConsent(page);

    const heroCityName = page.getByTestId("hero-city-name");
    await expect(heroCityName).toBeVisible({ timeout: 60000 });
    await expect(heroCityName).toHaveText("Chicago", { timeout: 10000 });

    const downloadActionCard = page.getByTestId("download-action-card");
    await expect(downloadActionCard).toBeVisible({ timeout: 60000 });
  });

  test("User can download inventory as CSV", async ({ page }, testInfo) => {
    await openDownloadModal(page);

    const download = await downloadCsv(page, inventoryId);
    const downloadPath = testInfo.outputPath("inventory.csv");

    const csvContent = saveDownloadContent(download.content, downloadPath);
    expect(csvContent.length).toBeGreaterThan(0);

    const headerLine = csvContent.trim().split("\n")[0];
    const headers = parse(headerLine, { columns: false })[0] as string[];
    expect(headers).toEqual(EXPECTED_CSV_HEADERS);

    expect(download.filename).toMatch(/inventory-.*\.csv/);
  });

  test("CSV download contains valid data structure", async ({ page }, testInfo) => {
    await openDownloadModal(page);

    const download = await downloadCsv(page, inventoryId);
    const downloadPath = testInfo.outputPath("inventory-structure.csv");
    const csvContent = saveDownloadContent(download.content, downloadPath);

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
  });

  test("CSV download handles errors gracefully", async ({ page }) => {
    await page.route("**/api/v1/inventory/**/download?format=csv**", (route) => {
      route.abort("failed");
    });

    await openDownloadModal(page);
    await selectDownloadFormat(page, "csv");
    await confirmDownload(page);

    await expect(
      page
        .getByText(
          /There was an error during download|Download failed|download-error/i,
        )
        .first(),
    ).toBeVisible({ timeout: 10000 });
  });

  test("Multiple format downloads work correctly", async ({ page }, testInfo) => {
    await openDownloadModal(page);

    const csvDownload = await downloadCsv(page, inventoryId);
    expect(csvDownload.filename).toContain(".csv");

    const csvPath = testInfo.outputPath("inventory-multi-format.csv");
    const csvContent = saveDownloadContent(csvDownload.content, csvPath);
    expect(csvContent).toContain("GPC Reference Number");

    await dismissToasts(page);
    await openDownloadModal(page);

    const ecrfDownload = await downloadEcrf(page, inventoryId);
    expect(ecrfDownload.filename).toMatch(/\.xlsx?$/);
  });

  test("CSV download preserves special characters and formatting", async ({
    page,
  }, testInfo) => {
    await openDownloadModal(page);

    const download = await downloadCsv(page, inventoryId);
    const downloadPath = testInfo.outputPath("inventory-formatting.csv");
    const csvContent = saveDownloadContent(download.content, downloadPath);

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
  });

  test("CSV download contains actual inventory data", async ({
    page,
  }, testInfo) => {
    test.setTimeout(180000);

    await addScope1ResidentialEmissions(page, cityId, inventoryId);

    await page.goto(`/en/cities/${cityId}/GHGI/${inventoryId}/`, {
      waitUntil: "domcontentloaded",
    });
    await dismissCookieConsent(page);
    await expect(page.getByTestId("download-action-card")).toBeVisible({
      timeout: 60000,
    });

    await openDownloadModal(page);

    const download = await downloadCsv(page, inventoryId);
    const downloadPath = testInfo.outputPath("inventory-with-data.csv");
    const csvContent = saveDownloadContent(download.content, downloadPath);

    const records = parse(csvContent, {
      columns: true,
      skip_empty_lines: true,
    }) as Record<string, string>[];

    expect(records.length).toBeGreaterThan(0);

    const residentialRecord = records.find(
      (record) =>
        record["GPC Reference Number"] === "I.1.1" &&
        record["Data source name"] === "test",
    );
    expect(residentialRecord).toBeTruthy();
    expect(residentialRecord?.["Subsector name"]).toBe("Residential buildings");
    expect(residentialRecord?.["Total Emission Units"]).toBe("t CO2e");

    const totalEmissions = parseFloat(residentialRecord?.["Total Emissions"] ?? "");
    expect(Number.isNaN(totalEmissions)).toBe(false);
    expect(totalEmissions).toBeGreaterThan(0);
  });
});
