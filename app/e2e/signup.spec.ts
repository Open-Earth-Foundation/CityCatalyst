import { test, expect, type Page } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/en/auth/signup");
});

test.describe("Signup", () => {
  test("should navigate to signup from login", async ({ page }) => {
    await page.goto("/");
    const link = page.getByText("Sign up");
    await expect(link).toBeVisible();
    await link.click();
    await expect(
      page.getByRole("heading", { name: "Sign Up to City Catalyst" }),
    ).toBeVisible();
  });

  test("should redirect to dashboard after entering correct data", async ({
    page,
  }) => {
    // await page.goto("http://localhost:3000/en/auth/signup");
    await expect(
      page.getByRole("heading", { name: "Sign Up to City Catalyst" }),
    ).toBeVisible();

    await page.getByPlaceholder("Your full name").click();
    await page.getByPlaceholder("Your full name").fill("Test User");
    await page.getByPlaceholder("e.g. youremail@domain.com").click();
    await page
      .getByPlaceholder("e.g. youremail@domain.com")
      .fill("test@example.com");
    await page.getByPlaceholder("e.g. youremail@domain.com").press("Tab");
    await page.getByLabel("Password", { exact: true }).fill("Test123");
    await page.getByLabel("Confirm Password").click();
    await page.getByLabel("Confirm Password").fill("Test123");
    await page.getByPlaceholder("Enter the code you received").fill("123456");
    await page
      .locator('input[name="acceptTerms"] + .chakra-checkbox__control')
      .click();
    await page.getByRole("button", { name: "Create Account" }).click();

    await expect(page).toHaveURL("/en/onboarding");
  });

  test.skip("should correctly handle and pass callbackUrl", () => {});
});
