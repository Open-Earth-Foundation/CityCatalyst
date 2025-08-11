import { expect, test as setup, test } from "@playwright/test";
import { expectText, signup } from "./helpers";

const TEST_ADMIN_EMAIL = "e2e-test-admin@citycatalyst.local";
const TEST_ADMIN_PASSWORD = "E2ETestAdmin123!";

const authFile = "playwright/.auth/user.json";

test.beforeEach(async ({ page }) => {});

setup("authenticate", async ({ page, request }) => {
  test.setTimeout(30000);
  
  // Login with the test admin (created by package.json script)
  await page.goto("/en/auth/login");
  await expectText(page, "Log In");
  await page.locator('input[name="email"]').fill(TEST_ADMIN_EMAIL);
  await page.locator('input[name="password"]').fill(TEST_ADMIN_PASSWORD);
  
  // Click login and wait for navigation
  await Promise.all([
    page.waitForURL((url) => !url.pathname.includes('/auth/login'), { timeout: 30000 }),
    page.locator('button[type="submit"]').click()
  ]);

  await page.context().storageState({ path: authFile });
});
