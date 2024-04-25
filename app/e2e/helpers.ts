import { expect, type Page, APIRequestContext } from "@playwright/test";

export async function expectText(page: Page, text: string) {
  await expect(page.getByText(text).first()).toBeVisible();
}

export async function signup(
  request: APIRequestContext,
  email: string,
  password: string = "Test123",
  confirmPassword: string = "Test123",
  name: string = "Test Account",
  inviteCode: string = "123456",
  acceptTerms: boolean = true,
) {
  const result = await request.post("/api/v0/auth/signup", {
    data: {
      email,
      password,
      confirmPassword,
      name,
      inviteCode,
      acceptTerms,
    },
  });
  expect(result.ok()).toBeTruthy();
  return await result.json();
}
