import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import {
  expectText,
  expectFieldInvalid,
  waitForAuthFormReady,
  dismissCookieConsent,
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
function signupUrlWithEmail(email: string, destination = "/en/cities") {
  const callbackUrl = encodeURIComponent(`${destination}?email=${email}`);
  return `/en/auth/signup?callbackUrl=${callbackUrl}`;
}

/** Shared checkbox control selector (Chakra v3 / Ark overlays the native input). */
async function acceptPrivacyPolicy(page: import("@playwright/test").Page) {
  await page.locator('[data-scope="checkbox"][data-part="control"]').click();
}

test.describe("Signup", () => {
  test("should navigate to signup from login (invite flow)", async ({
    page,
  }) => {
    // Sign-up CTA on login is only shown when callbackUrl carries an invite token.
    const inviteCallback = encodeURIComponent(
      "/en/user/invites?token=e2e-invite-token",
    );
    await page.goto(`/en/auth/login?callbackUrl=${inviteCallback}`);
    await dismissCookieConsent(page);

    const link = page.getByRole("link", { name: /sign.?up/i });
    await expect(link).toBeVisible();
    await link.click();

    await expect(
      page.getByRole("heading", { name: "Create your account" }),
    ).toBeVisible({ timeout: 15000 });
    await expect(page).toHaveURL(/\/en\/auth\/signup/);
  });

  test("should redirect after successful signup", async ({ page }) => {
    const email = `e2e-test+${randomUUID()}@example.com`;
    const destination = "/en/cities";
    await page.goto(signupUrlWithEmail(email, destination));
    await dismissCookieConsent(page);

    await expect(
      page.getByRole("heading", { name: "Create your account" }),
    ).toBeVisible({ timeout: 15000 });
    await waitForAuthFormReady(page, { expectEnabled: true });

    await page.getByPlaceholder("Your full name").fill("Test User");
    await page.getByLabel("Password", { exact: true }).fill("Test123!");
    await page.getByLabel("Confirm Password").fill("Test123!");
    await acceptPrivacyPolicy(page);
    await page.getByRole("button", { name: "Create Account" }).click();

    // Successful signup signs the user in and navigates to callbackUrl (or home).
    await expect(page).toHaveURL(new RegExp(`${destination}`), {
      timeout: 30000,
    });
  });

  test("should show errors when entering invalid data", async ({ page }) => {
    // Prefill email with an invalid value via the invitation URL pattern so
    // pattern validation fires on submit.
    await page.goto(signupUrlWithEmail("testopenearthorg"));
    await dismissCookieConsent(page);

    await expect(
      page.getByRole("heading", { name: "Create your account" }),
    ).toBeVisible({ timeout: 15000 });
    // Validation runs on submit; the button stays enabled so the user can trigger it.
    await waitForAuthFormReady(page, { expectEnabled: true });

    await page.getByPlaceholder("Your full name").fill("asd");
    await page.getByLabel("Password", { exact: true }).fill("Pas");
    await page.getByLabel("Confirm Password").fill("Pas");
    await acceptPrivacyPolicy(page);

    const submitButton = page.getByRole("button", { name: "Create Account" });
    await expect(submitButton).toBeEnabled();
    await submitButton.click();

    // Stay on signup; field-level errors surface after the submit attempt.
    await expect(page).toHaveURL(/\/en\/auth\/signup/);
    await expectFieldInvalid(page, "name");
    await expectFieldInvalid(page, "email");
    // Password pattern is guidance-only (not an RHF rule); short passwords
    // still leave the pattern hint in the error state after submit.
    await expect(
      page.getByText(/password must be at least 8 characters/i),
    ).toBeVisible();
  });

  test("should require matching passwords", async ({ page }) => {
    // Prefill the email field via the invitation URL pattern. The email is
    // valid, so on submit only the password-mismatch error should surface.
    await page.goto(signupUrlWithEmail("e2e-test-fail@example.com"));
    await dismissCookieConsent(page);

    await expect(
      page.getByRole("heading", { name: "Create your account" }),
    ).toBeVisible({ timeout: 15000 });
    await waitForAuthFormReady(page, { expectEnabled: true });

    await page.getByPlaceholder("Your full name").fill("Test Account");
    await page.getByLabel("Password", { exact: true }).fill("Password1");
    await page.getByLabel("Confirm Password").fill("Password2");
    await acceptPrivacyPolicy(page);

    const submitButton = page.getByRole("button", { name: "Create Account" });
    await expect(submitButton).toBeEnabled();
    await submitButton.click();

    await expectText(page, "Passwords do not match");
  });

  test("should correctly handle and pass callbackUrl", async ({ page }) => {
    const email = `e2e-callback+${randomUUID()}@example.com`;
    // Use a dedicated destination so we can assert callbackUrl is honored
    // (not just the default post-signup home path).
    const destination = "/en/cities/onboarding";
    await page.goto(signupUrlWithEmail(email, destination));
    await dismissCookieConsent(page);

    await expect(
      page.getByRole("heading", { name: "Create your account" }),
    ).toBeVisible({ timeout: 15000 });
    await waitForAuthFormReady(page, { expectEnabled: true });

    await page.getByPlaceholder("Your full name").fill("Callback User");
    await page.getByLabel("Password", { exact: true }).fill("Test123!");
    await page.getByLabel("Confirm Password").fill("Test123!");
    await acceptPrivacyPolicy(page);
    await page.getByRole("button", { name: "Create Account" }).click();

    await expect(page).toHaveURL(/\/en\/cities\/onboarding/, {
      timeout: 30000,
    });
  });
});
