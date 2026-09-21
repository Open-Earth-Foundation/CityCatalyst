import { describe, expect, it } from "@jest/globals";
import { generate } from "otplib";
import { generateTwoFactorSecret, verifyToken } from "@/lib/2fa";

describe("generateTwoFactorSecret", () => {
  it("returns a base32 secret and a matching otpauth URI", () => {
    const { secret, otpAuthUrl } = generateTwoFactorSecret(
      "jane.doe@example.com",
    );

    expect(secret).toMatch(/^[A-Z2-7]+$/);
    expect(otpAuthUrl).toMatch(/^otpauth:\/\/totp\//);
    expect(otpAuthUrl).toContain("CityCatalyst");
    expect(otpAuthUrl).toContain(encodeURIComponent("jane.doe@example.com"));
    expect(otpAuthUrl).toContain(secret);
  });

  it("generates a different secret on every call", () => {
    const first = generateTwoFactorSecret("jane.doe@example.com");
    const second = generateTwoFactorSecret("jane.doe@example.com");

    expect(first.secret).not.toBe(second.secret);
  });
});

describe("verifyToken", () => {
  it("returns true for a valid TOTP code generated from the secret", async () => {
    const { secret } = generateTwoFactorSecret("jane.doe@example.com");
    const token = await generate({ secret });

    await expect(verifyToken(token, secret)).resolves.toBe(true);
  });

  it("returns false for an incorrect TOTP code", async () => {
    const { secret } = generateTwoFactorSecret("jane.doe@example.com");
    const { secret: otherSecret } = generateTwoFactorSecret(
      "other.person@example.com",
    );
    const wrongToken = await generate({ secret: otherSecret });

    await expect(verifyToken(wrongToken, secret)).resolves.toBe(false);
  });

  it("returns false instead of throwing when the secret is malformed", async () => {
    await expect(
      verifyToken("123456", "not-a-valid-base32-secret!!!"),
    ).resolves.toBe(false);
  });
});
