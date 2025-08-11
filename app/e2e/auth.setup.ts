import { expect, test as setup, test } from "@playwright/test";
import { expectText } from "./helpers";
import { createTestAdmin, TEST_ADMIN_EMAIL, TEST_ADMIN_PASSWORD } from "../scripts/test-admin-setup";

const authFile = "playwright/.auth/user.json";

test.beforeEach(async ({ page }) => {});

setup("authenticate", async ({ page, request }) => {
  // Create test admin user before authentication
  test.setTimeout(60000);
  
  // Create/recreate the test admin user (this is idempotent)
  await createTestAdmin();
  
  // Login with the test admin credentials
  await page.goto("/en/auth/login");

  await expectText(page, "Log In");
  await page.locator('input[name="email"]').fill(TEST_ADMIN_EMAIL);
  await page.locator('input[name="password"]').fill(TEST_ADMIN_PASSWORD);
  await page.locator('button[type="submit"]').click();

  // TODO how to ensure that session route was called?
  await page.waitForResponse("/api/auth/session");

  await page.context().storageState({ path: authFile });
});
