import { test, expect } from "@playwright/test";
import {
  expectText,
  expectFieldInvalid,
  signup,
  waitForAuthFormReady,
  dismissCookieConsent,
} from "./helpers";
import { randomUUID } from "node:crypto";

test.setTimeout(120000);

test.beforeEach(async ({ page, context }) => {
  // make sure user is logged out to prevent order of execution issues
  await context.clearCookies();
  await page.goto("/en/auth/login");
  await dismissCookieConsent(page);
  // Wait until client handlers are attached so submit is not a native GET.
  await expect(page.getByTestId("login-form")).toHaveAttribute(
    "data-ready",
    "true",
    { timeout: 30000 },
  );
  await waitForAuthFormReady(page, { expectEnabled: true });
});

test.describe("Login page", () => {
  test("redirects away from login after entering correct data", async ({
    page,
    request,
  }) => {
    const email = `login-test+${randomUUID()}@openearth.org`;
    const password = "Test123!";
    await signup(request, email, password, password);

    await expectText(page, "Log In");

    await page.locator('input[name="email"]').fill(email);
    await page.locator('input[name="password"]').fill(password);
    await page.getByRole("button", { name: /log in/i }).click();

    // Successful login uses a full-page redirect to callbackUrl (default `/`).
    await expect(page).not.toHaveURL(/\/en\/auth\/login/, { timeout: 30000 });
  });

  test("shows errors when entering invalid data", async ({ page }) => {
    await expectText(page, "Log In");

    await page.locator('input[name="email"]').fill("testopenearthorg");
    await page.locator('input[name="password"]').fill("pas");
    await page.getByRole("button", { name: /log in/i }).click();

    await expect(page).toHaveURL(/\/en\/auth\/login\/?$/);
    await expectFieldInvalid(page, "email");
    await expectFieldInvalid(page, "password");
  });
});
