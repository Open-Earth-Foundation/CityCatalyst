import { db } from "@/models";
import { describe, it, expect, beforeAll, afterAll } from "@jest/globals";
import bcrypt from "bcrypt";
import { generate, generateSecret } from "otplib";
import { setupTests } from "./helpers";
import { authOptions } from "@/lib/auth";
import {
  createTestData,
  cleanupTestData,
  TestData,
} from "./helpers/testDataCreationHelper";

// The real credentials handler lives on `.options.authorize` (see Credentials()
// wrapper in src/lib/auth.ts) rather than on the provider config directly.
const credentialsProvider = authOptions.providers[0] as unknown as {
  options: {
    authorize: (
      credentials: Record<"email" | "password" | "securityToken", string>,
    ) => Promise<unknown>;
  };
};
const authorize = credentialsProvider.options.authorize;

describe("authorize() 2FA branch", () => {
  let testData: TestData;
  const password = "correct-horse-battery-staple";
  const secret = generateSecret();
  let userEmail: string;

  beforeAll(async () => {
    setupTests();
    await db.initialize();

    testData = await createTestData({
      userEmail: `authorize-2fa-${Date.now()}@example.com`,
    });
    const user = await db.models.User.findOne({
      where: { userId: testData.userId },
    });
    userEmail = user!.email!;

    await db.models.User.update(
      { passwordHash: await bcrypt.hash(password, 10) },
      { where: { userId: testData.userId } },
    );
  });

  afterAll(async () => {
    await cleanupTestData(testData);
    if (db.sequelize) await db.sequelize.close();
  });

  describe("when the user does not have 2FA enabled", () => {
    beforeAll(async () => {
      await db.models.User.update(
        { twoFactorEnabled: false, twoFactorSecret: null },
        { where: { userId: testData.userId } },
      );
    });

    it("logs the user in without requiring a securityToken", async () => {
      const result = await authorize({
        email: userEmail,
        password,
        securityToken: "",
      });

      expect(result).toMatchObject({ id: testData.userId });
    });
  });

  describe("when the user has 2FA enabled", () => {
    beforeAll(async () => {
      await db.models.User.update(
        { twoFactorEnabled: true, twoFactorSecret: secret },
        { where: { userId: testData.userId } },
      );
    });

    it("returns null when no securityToken is provided", async () => {
      const result = await authorize({
        email: userEmail,
        password,
        securityToken: "",
      });

      expect(result).toBeNull();
    });

    it("returns null when the securityToken is invalid", async () => {
      const result = await authorize({
        email: userEmail,
        password,
        securityToken: "000000",
      });

      expect(result).toBeNull();
    });

    it("logs the user in when the securityToken is valid", async () => {
      const token = await generate({ secret });

      const result = await authorize({
        email: userEmail,
        password,
        securityToken: token,
      });

      expect(result).toMatchObject({ id: testData.userId, email: userEmail });
    });

    it("returns null for an invalid password even with a valid securityToken", async () => {
      const token = await generate({ secret });

      const result = await authorize({
        email: userEmail,
        password: "wrong-password",
        securityToken: token,
      });

      expect(result).toBeNull();
    });
  });
});
