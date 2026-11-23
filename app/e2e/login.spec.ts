import { test, expect } from "@playwright/test";
import { expectText, dismissCookieConsent } from "./helpers";

test.use({ storageState: { cookies: [], origins: [] } });

test.setTimeout(60000);

test.beforeEach(async ({ page, context }) => {
  await context.clearCookies();
  await page.goto("/en/auth/login");
  await dismissCookieConsent(page);
});

test.describe("Login page", () => {
  test("shows identity sign-in CTA when public identity config is present", async ({
    page,
  }) => {
    await expectText(page, "Log In");
    const button = page.getByTestId("identity-login-button");
    await expect(button).toBeVisible({ timeout: 30000 });
    await expect(button).toBeEnabled();
  });

  test("starts the identity OIDC redirect when Continue is clicked", async ({
    page,
  }) => {
    const button = page.getByTestId("identity-login-button");
    await expect(button).toBeVisible({ timeout: 30000 });
    await expect(button).toBeEnabled();

    await button.click();

    // NextAuth routes through its signin endpoint, then to the OP authorize URL.
    // Identity is not running in CI; either hop is enough to prove the RP path.
    await expect(page).toHaveURL(
      /\/api\/auth\/signin\/identity|\/oauth\/authorize|localhost:3001/,
      { timeout: 30000 },
    );
  });
});
