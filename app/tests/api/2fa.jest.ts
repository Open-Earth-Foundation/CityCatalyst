import { db } from "@/models";
import { randomUUID } from "crypto";
import {
  beforeAll,
  afterAll,
  beforeEach,
  describe,
  it,
  expect,
  jest,
} from "@jest/globals";
import bcrypt from "bcrypt";
import { generate, generateSecret } from "otplib";
import {
  setupTests,
  mockRequest,
  createRequest,
  expectStatusCode,
} from "../helpers";
import {
  createTestData,
  cleanupTestData,
  TestData,
} from "../helpers/testDataCreationHelper";
import { AppSession, Auth } from "@/lib/auth";
import { Roles } from "@/util/types";
import { POST as setup2FA } from "@/app/api/v1/auth/2fa/setup/route";
import { POST as verify2FA } from "@/app/api/v1/auth/2fa/verify/route";
import { POST as disable2FA } from "@/app/api/v1/auth/2fa/disable/route";
import { GET as check2FA } from "@/app/api/v1/auth/2fa/check/route";

const emptyParams = { params: Promise.resolve({}) };
const userPassword = "correct-horse-battery-staple";
const checkUrl = "http://localhost:3000/api/v1/auth/2fa/check";
const validSecret = generateSecret();

function requestWithEmail(email: string) {
  return createRequest(`${checkUrl}?email=${encodeURIComponent(email)}`);
}

describe("2FA API routes", () => {
  let testData: TestData;
  let userSession: AppSession;
  const testUserEmail = `two-factor-${randomUUID()}@example.com`;

  beforeAll(async () => {
    setupTests();
    await db.initialize();

    testData = await createTestData({ userEmail: testUserEmail });

    userSession = {
      user: { id: testData.userId, role: Roles.User },
      expires: "1h",
    };
  });

  afterAll(async () => {
    await cleanupTestData(testData);
    if (db.sequelize) await db.sequelize.close();
  });

  beforeEach(async () => {
    jest.spyOn(Auth, "getServerSession").mockResolvedValue(userSession);
    await db.models.User.update(
      {
        twoFactorSecret: null,
        twoFactorEnabled: false,
        email: testUserEmail,
        passwordHash: await bcrypt.hash(userPassword, 10),
      },
      { where: { userId: testData.userId } },
    );
  });

  describe("POST /api/v1/auth/2fa/setup", () => {
    it("returns 401 when not signed in", async () => {
      jest.spyOn(Auth, "getServerSession").mockResolvedValue(null);
      const req = mockRequest();
      const res = await setup2FA(req, emptyParams);
      await expectStatusCode(res, 401);
    });

    it("returns 400 when the user has no email address", async () => {
      await db.models.User.update(
        { email: "" },
        { where: { userId: testData.userId } },
      );
      const req = mockRequest();
      const res = await setup2FA(req, emptyParams);
      await expectStatusCode(res, 400);
      const data = await res.json();
      expect(data.error.message).toMatch(/no email address/i);
    });

    it("creates a 2FA secret and returns a QR code data URL", async () => {
      const req = mockRequest();
      const res = await setup2FA(req, emptyParams);
      await expectStatusCode(res, 200);
      const data = await res.json();
      expect(data.data.success).toBe(true);
      expect(data.data.qrCodeDataUrl).toMatch(/^data:image\/png;base64,/);

      const user = await db.models.User.findOne({
        where: { userId: testData.userId },
      });
      expect(user!.twoFactorSecret).toBeTruthy();
      expect(user!.twoFactorEnabled).toBeFalsy();
    });

    it("returns 400 when 2FA is already configured", async () => {
      await db.models.User.update(
        { twoFactorSecret: validSecret, twoFactorEnabled: true },
        { where: { userId: testData.userId } },
      );
      const req = mockRequest();
      const res = await setup2FA(req, emptyParams);
      await expectStatusCode(res, 400);
      const data = await res.json();
      expect(data.error.message).toMatch(/already has 2FA configured/i);
    });
  });

  describe("POST /api/v1/auth/2fa/verify", () => {
    it("returns 401 when not signed in", async () => {
      jest.spyOn(Auth, "getServerSession").mockResolvedValue(null);
      const req = mockRequest({ token: "123456" });
      const res = await verify2FA(req, emptyParams);
      await expectStatusCode(res, 401);
    });

    it("returns 400 when 2FA setup hasn't been initialized", async () => {
      const req = mockRequest({ token: "123456" });
      const res = await verify2FA(req, emptyParams);
      await expectStatusCode(res, 400);
      const data = await res.json();
      expect(data.error.message).toMatch(/not initialized/i);
    });

    it("returns 400 for an invalid token", async () => {
      await db.models.User.update(
        { twoFactorSecret: validSecret },
        { where: { userId: testData.userId } },
      );
      const req = mockRequest({ token: "000000" });
      const res = await verify2FA(req, emptyParams);
      await expectStatusCode(res, 400);
      const data = await res.json();
      expect(data.error.message).toMatch(/invalid 2fa token/i);

      const user = await db.models.User.findOne({
        where: { userId: testData.userId },
      });
      expect(user!.twoFactorEnabled).toBeFalsy();
    });

    it("enables 2FA for a valid token", async () => {
      await db.models.User.update(
        { twoFactorSecret: validSecret },
        { where: { userId: testData.userId } },
      );
      const token = await generate({ secret: validSecret });

      const req = mockRequest({ token });
      const res = await verify2FA(req, emptyParams);
      await expectStatusCode(res, 200);
      const data = await res.json();
      expect(data.data.success).toBe(true);

      const user = await db.models.User.findOne({
        where: { userId: testData.userId },
      });
      expect(user!.twoFactorEnabled).toBe(true);
    });

    it("returns 400 when the token is missing", async () => {
      const req = mockRequest({});
      const res = await verify2FA(req, emptyParams);
      await expectStatusCode(res, 400);
    });
  });

  describe("POST /api/v1/auth/2fa/disable", () => {
    it("returns 401 when not signed in", async () => {
      jest.spyOn(Auth, "getServerSession").mockResolvedValue(null);
      const req = mockRequest({ password: userPassword });
      const res = await disable2FA(req, emptyParams);
      await expectStatusCode(res, 401);
    });

    it("returns 400 when 2FA is not set up for the user", async () => {
      const req = mockRequest({ password: userPassword });
      const res = await disable2FA(req, emptyParams);
      await expectStatusCode(res, 400);
      const data = await res.json();
      expect(data.error.message).toMatch(/2FA is not set up/i);
    });

    it("returns 400 for an incorrect password", async () => {
      await db.models.User.update(
        { twoFactorSecret: validSecret, twoFactorEnabled: true },
        { where: { userId: testData.userId } },
      );
      const req = mockRequest({ password: "wrong-password" });
      const res = await disable2FA(req, emptyParams);
      await expectStatusCode(res, 400);
      const data = await res.json();
      expect(data.error.message).toMatch(/invalid password/i);
    });

    it("disables 2FA for the correct password", async () => {
      await db.models.User.update(
        { twoFactorSecret: validSecret, twoFactorEnabled: true },
        { where: { userId: testData.userId } },
      );
      const req = mockRequest({ password: userPassword });
      const res = await disable2FA(req, emptyParams);
      await expectStatusCode(res, 200);
      const data = await res.json();
      expect(data.data.success).toBe(true);

      const user = await db.models.User.findOne({
        where: { userId: testData.userId },
      });
      expect(user!.twoFactorEnabled).toBe(false);
      expect(user!.twoFactorSecret).toBeFalsy();
    });
  });

  describe("GET /api/v1/auth/2fa/check", () => {
    it("returns 400 for an invalid email", async () => {
      const req = requestWithEmail("not-an-email");
      const res = await check2FA(req, emptyParams);
      await expectStatusCode(res, 400);
    });

    it("returns enabled:false when the user doesn't exist", async () => {
      const req = requestWithEmail("no-such-user@example.com");
      const res = await check2FA(req, emptyParams);
      await expectStatusCode(res, 200);
      const data = await res.json();
      expect(data.data.enabled).toBe(false);
    });

    it("returns enabled:false when the user hasn't enabled 2FA", async () => {
      const req = requestWithEmail(testUserEmail);
      const res = await check2FA(req, emptyParams);
      await expectStatusCode(res, 200);
      const data = await res.json();
      expect(data.data.enabled).toBe(false);
    });

    it("returns enabled:true when the user has 2FA enabled", async () => {
      await db.models.User.update(
        { twoFactorSecret: validSecret, twoFactorEnabled: true },
        { where: { userId: testData.userId } },
      );
      const req = requestWithEmail(testUserEmail);
      const res = await check2FA(req, emptyParams);
      await expectStatusCode(res, 200);
      const data = await res.json();
      expect(data.data.enabled).toBe(true);
    });
  });
});
