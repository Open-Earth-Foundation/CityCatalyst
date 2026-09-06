import { expect, test as setup } from "@playwright/test";

// Reuse the normal CSRF + credentials authentication flow from auth.setup.ts.
// This fixed synthetic author is seeded only into the isolated fixture DB.
setup("authenticate the isolated CNB author", async ({ page }) => {
  const csrfResponse = await page.request.get("/api/auth/csrf");
  expect(csrfResponse.ok()).toBeTruthy();
  const { csrfToken } = await csrfResponse.json();
  const response = await page.request.post("/api/auth/callback/credentials", {
    form: {
      csrfToken,
      email:
        process.env.CNB_EDIT_TEST_EMAIL ?? "cc732-author@citycatalyst.local",
      password:
        process.env.CNB_EDIT_TEST_PASSWORD ?? "CC732SyntheticAuthorOnly!",
      callbackUrl: "/en/cities",
      json: "true",
    },
  });
  expect(response.ok()).toBeTruthy();
  const body = await response.json();
  expect(body.url).not.toMatch(/\/auth\/login|error=/);

  await page.goto("/en/cities");
  await expect(page).toHaveURL(/\/cities\//);
  await page
    .context()
    .storageState({ path: "playwright/.auth/cnb-edits.json" });
});
