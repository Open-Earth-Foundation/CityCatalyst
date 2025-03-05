import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { expectText } from "./helpers";

test.use({ storageState: { cookies: [], origins: [] } });

test.beforeEach(async ({ page }) => {
  await page.goto("/en/auth/signup");
});

test.setTimeout(60000);

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
    await expect(
      page.getByRole("heading", { name: "Sign Up to City Catalyst" }),
    ).toBeVisible();

    const email = `e2e-test+${randomUUID()}@example.com`;

    await page.getByPlaceholder("Your full name").fill("Test User");
    await page.getByPlaceholder("e.g. youremail@domain.com").fill(email);
    await page.getByLabel("Password", { exact: true }).fill("Test123!");
    await page.getByLabel("Confirm Password").fill("Test123!");
    await page.getByPlaceholder("Enter the code you received").fill("123456");
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
    await expect(
      page.getByRole("heading", { name: "Sign Up to City Catalyst" }),
    ).toBeVisible();

    await page.getByPlaceholder("Your full name").fill("asd");
    await page
      .getByPlaceholder("e.g. youremail@domain.com")
      .fill("testopenearthorg");
    await page.getByLabel("Password", { exact: true }).fill("Pas");
    await page.getByLabel("Confirm Password").fill("Pa1");
    await page.getByPlaceholder("Enter the code you received").fill("12345");
    await page.getByRole("button", { name: "Create Account" }).click();

    await expect(page).toHaveURL(`/en/auth/signup/`);
    await expectText(page, "valid email address");
    await expectText(page, "Minimum length");
    await expectText(page, "Invalid invite code");
    await expectText(page, "Please accept the terms");
  });

  test("should require matching passwords", async ({ page }) => {
    await expect(
      page.getByRole("heading", { name: "Sign Up to City Catalyst" }),
    ).toBeVisible();

    await page.getByPlaceholder("Your full name").fill("Test Account");
    await page
      .getByPlaceholder("e.g. youremail@domain.com")
      .fill("e2e-test-fail@example.com");
    await page.getByLabel("Password", { exact: true }).fill("Password1");
    await page.getByLabel("Confirm Password").fill("Password2");
    await page.getByPlaceholder("Enter the code you received").fill("123456");
    await page
      .locator('input[name="acceptTerms"] + .chakra-checkbox__control') // sibling
      .click();
    await page.getByRole("button", { name: "Create Account" }).click();

    await expect(page).toHaveURL(`/en/auth/signup/`);
    await expectText(page, "Passwords don't match");
  });

  test.skip("should correctly handle and pass callbackUrl", () => {});
});
