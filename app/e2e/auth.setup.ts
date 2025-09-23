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


  // Fill the login form
  await page.locator('input[name="email"]').fill(TEST_ADMIN_EMAIL);
  await page.locator('input[name="password"]').fill(TEST_ADMIN_PASSWORD);
  
  // Verify the form is filled
  await page.waitForTimeout(500);
  
  // Click login and wait for navigation to cities page
  await Promise.all([
    page.waitForURL((url) => url.pathname.includes('/cities'), { timeout: 30000 }),
    page.locator('button[type="submit"]').click()
  ]);

  await page.waitForLoadState("networkidle");

  await page.context().storageState({ path: authFile });
});
