import { expect, test as setup, test } from "@playwright/test";
import { expectText, signup } from "./helpers";
import { TEST_ADMIN_EMAIL, TEST_ADMIN_PASSWORD } from "./test-constants";

const authFile = "playwright/.auth/user.json";

test.beforeEach(async ({ page }) => {});

setup("authenticate", async ({ page, request }) => {
  test.setTimeout(30000);
  
  // Login with the test admin (created by global setup)
  await page.goto("/en/auth/login");
  await expectText(page, "Log In");


    // Handle cookie consent banner if it appears
  const cookieDeclineButton = page.getByTestId("cookie-decline-button");
  await cookieDeclineButton.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
  if (await cookieDeclineButton.isVisible().catch(() => false)) {
    await cookieDeclineButton.click();
    // Wait for cookie banner to disappear
    await cookieDeclineButton.waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {});
  }

  await page.locator('input[name="email"]').fill(TEST_ADMIN_EMAIL);
  await page.locator('input[name="password"]').fill(TEST_ADMIN_PASSWORD);
  
  
  // Click login and wait for navigation
  await Promise.all([
    page.waitForURL((url) => !url.pathname.includes('/auth/login'), { timeout: 30000 }),
    page.locator('button[type="submit"]').click()
  ]);

  await page.context().storageState({ path: authFile });
});
