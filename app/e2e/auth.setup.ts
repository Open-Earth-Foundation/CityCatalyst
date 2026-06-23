import { expect, test as setup, test } from "@playwright/test";
import { TEST_ADMIN_EMAIL, TEST_ADMIN_PASSWORD } from "./test-constants";

const authFile = "playwright/.auth/user.json";

test.beforeEach(async () => {});

setup("authenticate", async ({ page }) => {
  test.setTimeout(60000);

  const csrfResponse = await page.request.get("/api/auth/csrf");
  expect(csrfResponse.ok()).toBeTruthy();
  const { csrfToken } = await csrfResponse.json();

  const loginResponse = await page.request.post(
    "/api/auth/callback/credentials",
    {
      form: {
        csrfToken,
        email: TEST_ADMIN_EMAIL,
        password: TEST_ADMIN_PASSWORD,
        callbackUrl: "/en/cities",
        json: "true",
      },
    },
  );
  expect(loginResponse.ok()).toBeTruthy();
  const loginBody = await loginResponse.json();
  expect(loginBody.url).not.toMatch(/\/auth\/login/);

  await page.goto("/en/cities");
  await page.waitForLoadState("networkidle");
  await expect(page).toHaveURL(/\/cities/, { timeout: 30000 });

  await page.context().storageState({ path: authFile });
});
