import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import {
  expectText,
  expectFieldInvalid,
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
    // Button starts disabled until all fields are valid (new UX)
    await waitForAuthFormReady(page, { expectEnabled: false });

    // Fill invalid name (too short) — use clear + pressSequentially to fire
    // individual keystroke events so react-hook-form's onChange validation
    // processes each character reliably.
    const nameInput = page.getByPlaceholder("Your full name");
    await nameInput.click();
    await nameInput.fill("");
    await nameInput.pressSequentially("asd");
    // Tab to next field to trigger blur validation
    await page.keyboard.press("Tab");

    // Fill short password using same approach
    const passwordInput = page.getByLabel("Password", { exact: true });
    await passwordInput.click();
    await passwordInput.fill("");
    await passwordInput.pressSequentially("Pas");
    // Tab away to trigger blur
    await page.keyboard.press("Tab");

    // Button must remain disabled when inputs are invalid
    const submitButton = page.getByRole("button", { name: "Create Account" });
    await expect(submitButton).toBeDisabled();

    // Field-level errors should appear via onChange validation
    await expectFieldInvalid(page, "name");
    await expectFieldInvalid(page, "password");
  });

  test("should require matching passwords", async ({ page }) => {
    // Prefill the email field via the invitation URL pattern. The email is
    // valid, so on submit only the password-mismatch error should surface.
    await page.goto(signupUrlWithEmail("e2e-test-fail@example.com"));

    await expect(
      page.getByRole("heading", { name: "Sign Up to City Catalyst" }),
    ).toBeVisible();
    // Button starts disabled until all fields are valid (new UX)
    await waitForAuthFormReady(page, { expectEnabled: false });

    await page.getByPlaceholder("Your full name").fill("Test Account");
    await page.getByLabel("Password", { exact: true }).fill("Password1");
    await page.getByLabel("Confirm Password").fill("Password2");

    // Mismatch message is shown reactively — no submit needed
    await expectText(page, "Passwords do not match");

    // Button must remain disabled while passwords do not match
    const submitButton = page.getByRole("button", { name: "Create Account" });
    await expect(submitButton).toBeDisabled();
  });

  test.skip("should correctly handle and pass callbackUrl", () => {});
});
