import { test, expect, devices } from "@playwright/test";
import { dismissCookieConsent, navigateToGHGIModule } from "./helpers";

test.describe("Clima Chat Popover Responsive Design", () => {
  test("popover fits within mobile viewport at 390px width", async ({
    browser,
  }) => {
    const context = await browser.newContext({
      ...devices["iPhone 12 Mini"],
      viewport: { width: 390, height: 844 },
      storageState: "playwright/.auth/user.json",
    });
    const page = await context.newPage();

    await navigateToGHGIModule(page);
    await dismissCookieConsent(page);

    const askAiButton = page.locator('[data-ai-button]');
    await expect(askAiButton).toBeVisible({ timeout: 10000 });

    await askAiButton.click();

    const popoverContent = page.locator('[role="dialog"]').first();
    await expect(popoverContent).toBeVisible({ timeout: 5000 });

    const popoverBox = await popoverContent.boundingBox();
    expect(popoverBox).not.toBeNull();

    const viewportWidth = 390;
    const expectedMaxWidth = viewportWidth - 32;

    expect(popoverBox!.width).toBeLessThanOrEqual(expectedMaxWidth);
    expect(popoverBox!.x).toBeGreaterThanOrEqual(0);
    expect(popoverBox!.x + popoverBox!.width).toBeLessThanOrEqual(viewportWidth);

    await context.close();
  });

  test("popover maintains 533px width at desktop viewport", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 });

    await navigateToGHGIModule(page);
    await dismissCookieConsent(page);

    const askAiButton = page.locator('[data-ai-button]');
    await expect(askAiButton).toBeVisible({ timeout: 10000 });

    await askAiButton.click();

    const popoverContent = page.locator('[role="dialog"]').first();
    await expect(popoverContent).toBeVisible({ timeout: 5000 });

    const popoverBox = await popoverContent.boundingBox();
    expect(popoverBox).not.toBeNull();

    expect(popoverBox!.width).toBe(533);
  });

  test("popover content is fully accessible on mobile without horizontal scroll", async ({
    browser,
  }) => {
    const context = await browser.newContext({
      ...devices["iPhone 12 Mini"],
      viewport: { width: 390, height: 844 },
      storageState: "playwright/.auth/user.json",
    });
    const page = await context.newPage();

    await navigateToGHGIModule(page);
    await dismissCookieConsent(page);

    const askAiButton = page.locator('[data-ai-button]');
    await expect(askAiButton).toBeVisible({ timeout: 10000 });

    await askAiButton.click();

    const popoverContent = page.locator('[role="dialog"]').first();
    await expect(popoverContent).toBeVisible({ timeout: 5000 });

    const closeButton = page.locator('[aria-label*="Close"]').first();
    await expect(closeButton).toBeVisible();

    const closeButtonBox = await closeButton.boundingBox();
    expect(closeButtonBox).not.toBeNull();
    expect(closeButtonBox!.x + closeButtonBox!.width).toBeLessThanOrEqual(390);

    await context.close();
  });
});
