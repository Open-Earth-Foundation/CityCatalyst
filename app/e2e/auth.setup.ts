import { expect, test as setup, test } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { expectText, signup } from "./helpers";

const authFile = "playwright/.auth/user.json";

test.beforeEach(async ({ page }) => {});

setup("authenticate", async ({ page, request }) => {
  // log the user in
  const email = `login-test+${randomUUID()}@openearth.org`;
  const password = "Test123!";
  await signup(request, email, password, password);

  await page.goto("/en/auth/login");

  await expectText(page, "Log In to City Catalyst");
  await page.locator('input[name="email"]').fill(email);
  await page.locator('input[name="password"]').fill(password);
  await page.locator('button[type="submit"]').click();

  // TODO how to ensure that session route was called?
  await page.waitForResponse("/api/auth/session");

  await page.context().storageState({ path: authFile });
});
