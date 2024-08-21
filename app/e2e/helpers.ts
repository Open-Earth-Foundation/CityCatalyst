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
  const result = await request.post("/api/v0/auth/register", {
    data: {
      email,
      password,
      confirmPassword,
      name,
      inviteCode,
      acceptTerms,
    },
  });
  console.log("result", result);
  expect(result.ok()).toBeTruthy();
  return await result.json();
}

export async function createInventory(
  request: APIRequestContext,
  name: string,
  description: string,
  sector: string,
  subsector: string,
  methodology: string,
) {
  const result = await request.post("/api/v0/inventory", {
    data: {
      name,
      description,
      sector,
      subsector,
      methodology,
    },
  });
  expect(result.ok()).toBeTruthy();
  return await result.json();
}
