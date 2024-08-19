import { test, expect, Page } from "@playwright/test";
import { indexPageRegex, regexForPath } from "./utils";

const testIds = {
  addDataToInventoryNavButton: "add-data-to-inventory-card",
};

test.describe("Manual Input", () => {
  let page: Page;

  test.beforeAll(async ({ browser }) => {
    page = await browser.newPage();
    await page.goto("/");
  });

  test.afterAll(async () => {
    await page.close();
  });

  test("should render sector list", async () => {
    await page.click(`[data-testid="${testIds.addDataToInventoryNavButton}"]`);
    await page.waitForURL(regexForPath("/data"));
    await expect(page).toHaveURL(/.*data-page/); // adjust regex to match your data page URL
  });

  test.skip("should have the correct number of sector cards", async () => {
    const sectors = await page.$$(`[data-testid="sector-card"]`);
    // Assuming you have an expected sectors count
    const expectedSectorCount = 5; // update with actual expected value
    expect(sectors.length).toBe(expectedSectorCount);
  });

  test.skip("should fetch subsectors correctly", async () => {
    await page.click(`[data-testid="sector-card"]`); // clicks on the first sector card
    const subsectors = await page.$$(`[data-testid="subsector-card"]`);
    expect(subsectors.length).toBeGreaterThan(0); // expects at least one subsector
  });

  test.skip("should navigate to subsector page on clicking a subsector", async () => {
    await page.click(`[data-testid="subsector-card"]`); // clicks on the first subsector card
    await expect(page).toHaveURL(/.*subsector-page/); // adjust regex to match your subsector page URL
  });

  test.skip("should display correct number of methodology cards based on subsector reference number", async () => {
    const referenceNumber = await page.getAttribute(
      `[data-testid="subsector-reference"]`,
      "data-reference-number",
    );
    const methodologyCards = await page.$$(`[data-testid="methodology-card"]`);
    // Replace with logic to determine the correct number of methodology cards based on the reference number
    const expectedMethodologyCount = 3; // example value
    expect(methodologyCards.length).toBe(expectedMethodologyCount);
  });
});
