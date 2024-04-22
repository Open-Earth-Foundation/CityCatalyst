import { test, expect } from "@playwright/test";

test("root page has title and heading", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle(/CityCatalyst/);

  // Click the get started link.
  // await page.getByRole("link", { name: "Get started" }).click();

  // Expects page to have a heading with the name of Installation.
  await expect(
    page.getByRole("heading", { name: "CityCatalyst" }),
  ).toBeVisible();
});
