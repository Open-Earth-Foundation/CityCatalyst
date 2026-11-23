import { test, expect } from "@playwright/test";
import { dismissCookieConsent } from "./helpers";

test.use({ storageState: { cookies: [], origins: [] } });

test.setTimeout(30000);

/**
 * Local signup pages were removed in CC-1283. Registration lives on
 * core-identity-service; CityCatalyst only offers the identity login CTA.
 */
test.describe("Signup (moved to identity)", () => {
  test("legacy /auth/signup no longer shows a local registration form", async ({
    page,
  }) => {
    await page.goto("/en/auth/signup");
    await expect(
      page.getByRole("heading", { name: "Create your account" }),
    ).toHaveCount(0);

    await page.goto("/en/auth/login");
    await dismissCookieConsent(page);
    await expect(page.getByTestId("identity-login-button")).toBeVisible({
      timeout: 30000,
    });
  });
});
