import { test, expect, APIRequestContext } from "@playwright/test";
import { expectText, signup } from "./helpers";
import { randomUUID } from "node:crypto";

test.beforeEach(async ({ page }) => {
  await page.goto("/en/auth/login");
});

test.describe("Login page", () => {
  test.skip("redirects to onboarding after entering correct data", async ({
    page,
    request,
  }) => {
    const email = `login-test+${randomUUID()}@openearth.org`;
    const password = "Test123!";
    await signup(request, email, password, password);
    // await page.route("/api/auth/session", (route) => {
    //   route.fulfill({ body: JSON.stringify({ ok: true }) });
    // });

    await expectText(page, "Log In to City Catalyst");
    await page.locator('input[name="email"]').fill(email);
    await page.locator('input[name="password"]').fill(password);
    await page.locator('button[type="submit"]').click();

    // TODO how to ensure that session route was called?
    await page.waitForResponse("/api/auth/session");

    await expect(page).not.toHaveURL("/en/onboarding/");
  });

  test("shows errors when entering invalid data", async ({ page }) => {
    await expectText(page, "Log In to City Catalyst");

    await page.locator('input[name="email"]').fill("testopenearthorg");
    await page.locator('input[name="password"]').fill("pas");
    await page.locator('button[type="submit"]').click();

    await expect(page).toHaveURL("/en/onboarding/");
    await expectText(page, "valid email address");
    await expectText(page, "Minimum length");
  });
});
