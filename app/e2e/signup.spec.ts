import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import {
  expectText,
  expectFieldInvalid,
  expectValidationMessage,
  waitForAuthFormReady,
} from "./helpers";

test.use({ storageState: { cookies: [], origins: [] } });

test.setTimeout(60000);

/**
 * Build a signup URL that mimics how the invitation flow links users:
 * the recipient lands on `/auth/signup?callbackUrl=<encoded-post-signup-url>`
 * where the post-signup URL carries `?email=<recipient-email>`. The signup
 * page extracts that email and prefills the (read-only) email field.
 *
 * Using this URL in tests avoids having to `fill()` the email input, which
 * Playwright can't reliably do once the field is rendered as `readOnly`.
 */
function signupUrlWithEmail(email: string): string {
  const callbackUrl = encodeURIComponent(`/en/cities?email=${email}`);
  return `/en/auth/signup?callbackUrl=${callbackUrl}`;
}

test.describe("Signup", () => {
  test.skip("should navigate to signup from login", async ({ page }) => {
    await page.goto("/");
    const link = page.getByText("Sign up");
    await expect(link).toBeVisible();
    await link.click();
    await expect(
      page.getByRole("heading", { name: "Sign Up to City Catalyst" }),
    ).toBeVisible();
  });

  test.skip("should redirect to dashboard after entering correct data", async ({
    page,
  }) => {
    const email = `e2e-test+${randomUUID()}@example.com`;
    await page.goto(signupUrlWithEmail(email));

    await expect(
      page.getByRole("heading", { name: "Sign Up to City Catalyst" }),
    ).toBeVisible();

    await page.getByPlaceholder("Your full name").fill("Test User");
    await page.getByLabel("Password", { exact: true }).fill("Test123!");
    await page.getByLabel("Confirm Password").fill("Test123!");
    await page
      .locator('input[name="acceptTerms"] + .chakra-checkbox__control')
      .click();
    await page.getByRole("button", { name: "Create Account" }).click();

    await page.waitForLoadState("load");

    await expect(page).toHaveURL(
      `/en/auth/check-email/?email=${email.replace("@", "%40")}`,
      {
        timeout: 30000,
      },
    );
  });

  test("should show errors when entering invalid data", async ({ page }) => {
    // Prefill the email field with an invalid value via the invitation URL
    // pattern so the pattern-validation message fires on submit.
    await page.goto(signupUrlWithEmail("testopenearthorg"));

    await expect(
      page.getByRole("heading", { name: "Sign Up to City Catalyst" }),
    ).toBeVisible();
    await waitForAuthFormReady(page);

    await page.getByPlaceholder("Your full name").fill("asd");
    await page.getByLabel("Password", { exact: true }).fill("Pas");
    await page.getByLabel("Confirm Password").fill("Pa1");
    await page.getByRole("button", { name: "Create Account" }).click();

    await expect(page).toHaveURL(/\/en\/auth\/signup/);
    await expectFieldInvalid(page, "email");
    await expectFieldInvalid(page, "name");
    await expectFieldInvalid(page, "password");
    await expectValidationMessage(page, /accept the privacy policy/i);
  });

  test("should require matching passwords", async ({ page }) => {
    // Prefill the email field via the invitation URL pattern. The email is
    // valid, so on submit only the password-mismatch error should surface.
    await page.goto(signupUrlWithEmail("e2e-test-fail@example.com"));

    await expect(
      page.getByRole("heading", { name: "Sign Up to City Catalyst" }),
    ).toBeVisible();
    await waitForAuthFormReady(page);

    await page.getByPlaceholder("Your full name").fill("Test Account");
    await page.getByLabel("Password", { exact: true }).fill("Password1");
    await page.getByLabel("Confirm Password").fill("Password2");
    await page
      .locator('input[name="acceptTerms"] + .chakra-checkbox__control') // sibling
      .click();
    await page.getByRole("button", { name: "Create Account" }).click();

    await expectText(page, "Passwords don't match");
  });

  test.skip("should correctly handle and pass callbackUrl", () => {});
});
