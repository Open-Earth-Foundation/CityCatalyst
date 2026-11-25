/**
 * CC-1273: characterization tests for the password reset flow,
 * POST /api/v1/auth/forgot and POST /api/v1/auth/password.
 *
 * These pin what the routes do today, quirks included, so that moving them to
 * the identity service (CC-1279) can be checked against them. A test marked
 * "quirk" documents behavior that looks unintended; do not fix it here.
 */
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { randomUUID } from "node:crypto";
import { db } from "@/models";
import {
  expectStatusCode,
  mockRequest,
  setupTests,
  teardownTests,
} from "../helpers";

// The forgot route sends mail through SMTP. Replace it before the route loads.
const sendEmailMock = jest.fn<(data: unknown) => Promise<void>>();
jest.unstable_mockModule("@/lib/email", () => ({ sendEmail: sendEmailMock }));
const { POST: forgot } = await import("@/app/api/v1/auth/forgot/route");
const { POST: resetPassword } =
  await import("@/app/api/v1/auth/password/route");

const RESET_SECRET = "cc1273-reset-secret";
const OLD_PASSWORD = "OldPassw0rd";
const NEW_PASSWORD = "NewPassw0rd";
const noParams = { params: Promise.resolve({}) };

describe("Password reset", () => {
  const userId = randomUUID();
  // Stored in lower case, as the register route does.
  const email = `reset-${randomUUID()}@example.com`;
  const saved: Record<string, string | undefined> = {};

  const callForgot = (body: unknown) => forgot(mockRequest(body), noParams);
  const callReset = (body: unknown) =>
    resetPassword(mockRequest(body), noParams);

  /** A reset token as the forgot route would issue it. */
  const resetToken = (
    payload: object = { email },
    secret = RESET_SECRET,
    options: jwt.SignOptions = { expiresIn: "1h" },
  ) => jwt.sign(payload, secret, options);

  async function storedHash() {
    const user = await db.models.User.findByPk(userId);
    return user!.passwordHash!;
  }

  beforeAll(async () => {
    setupTests();
    await db.initialize();
    await db.models.User.create({
      userId,
      name: "Reset Tester",
      email,
      passwordHash: await bcrypt.hash(OLD_PASSWORD, 4),
      preferredLanguage: "en",
    });
  });

  afterAll(async () => {
    await db.models.User.destroy({ where: { userId } });
    teardownTests();
    await db.sequelize?.close();
  });

  beforeEach(async () => {
    for (const name of ["RESET_TOKEN_SECRET", "VERIFICATION_TOKEN_SECRET"]) {
      saved[name] = process.env[name];
    }
    process.env.RESET_TOKEN_SECRET = RESET_SECRET;
    process.env.VERIFICATION_TOKEN_SECRET = "cc1273-verification-secret";
    sendEmailMock.mockReset();
    sendEmailMock.mockResolvedValue(undefined);
    // Every test starts from the same password.
    await db.models.User.update(
      { passwordHash: await bcrypt.hash(OLD_PASSWORD, 4) },
      { where: { userId } },
    );
  });

  afterEach(() => {
    for (const [name, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  });

  describe("POST /api/v1/auth/forgot", () => {
    it("answers 200 with an empty body and emails a reset link", async () => {
      const res = await callForgot({ email });
      await expectStatusCode(res, 200);
      expect(await res.json()).toEqual({});

      expect(sendEmailMock).toHaveBeenCalledTimes(1);
      const mail = sendEmailMock.mock.calls[0][0] as {
        to: string;
        subject: string;
        html: string;
      };
      expect(mail.to).toBe(email);
      expect(mail.subject).toBeTruthy();
      expect(mail.html).toContain("/auth/update-password?token=");
    });

    it("puts a token in the link that expires in one hour and names the user's email", async () => {
      await callForgot({ email });
      const { html } = sendEmailMock.mock.calls[0][0] as { html: string };
      const match = html.match(/update-password\?token=([^"&\s<]+)/);
      expect(match).not.toBeNull();

      const token = decodeURIComponent(match![1]);
      const claims = jwt.verify(token, RESET_SECRET) as jwt.JwtPayload;
      expect(claims.email).toBe(email);
      expect(claims.exp! - claims.iat!).toBe(3600);
    });

    it("is silent about an unknown address: 200, and no email", async () => {
      const res = await callForgot({
        email: `nobody-${randomUUID()}@example.com`,
      });
      await expectStatusCode(res, 200);
      expect(await res.json()).toEqual({});
      expect(sendEmailMock).not.toHaveBeenCalled();
    });

    it("quirk: does not match the address in another case, unlike register", async () => {
      // register stores lower case, so a user who types a capital letter gets
      // the silent no-op and never receives the reset email.
      const res = await callForgot({ email: email.toUpperCase() });
      await expectStatusCode(res, 200);
      expect(sendEmailMock).not.toHaveBeenCalled();
    });

    it("answers 400 for a malformed email", async () => {
      const res = await callForgot({ email: "not-an-email" });
      await expectStatusCode(res, 400);
      expect(sendEmailMock).not.toHaveBeenCalled();
    });

    it("answers 500 when RESET_TOKEN_SECRET is not set, even for an unknown address", async () => {
      delete process.env.RESET_TOKEN_SECRET;
      const res = await callForgot({
        email: `nobody-${randomUUID()}@example.com`,
      });
      await expectStatusCode(res, 500);
    });

    it("answers 500 when the email cannot be sent", async () => {
      sendEmailMock.mockRejectedValue(new Error("SMTP down"));
      const res = await callForgot({ email });
      await expectStatusCode(res, 500);
    });
  });

  describe("POST /api/v1/auth/password", () => {
    it("sets the new password with a valid token and answers 200 with an empty body", async () => {
      const res = await callReset({
        newPassword: NEW_PASSWORD,
        resetToken: resetToken(),
      });
      await expectStatusCode(res, 200);
      expect(await res.json()).toEqual({});

      const hash = await storedHash();
      expect(await bcrypt.compare(NEW_PASSWORD, hash)).toBe(true);
      expect(await bcrypt.compare(OLD_PASSWORD, hash)).toBe(false);
    });

    it("hashes the new password with bcrypt cost 12", async () => {
      await callReset({ newPassword: NEW_PASSWORD, resetToken: resetToken() });
      expect(bcrypt.getRounds(await storedHash())).toBe(12);
    });

    it("works with a token made by the forgot route", async () => {
      await callForgot({ email });
      const { html } = sendEmailMock.mock.calls[0][0] as { html: string };
      const token = decodeURIComponent(
        html.match(/update-password\?token=([^"&\s<]+)/)![1],
      );
      const res = await callReset({
        newPassword: NEW_PASSWORD,
        resetToken: token,
      });
      await expectStatusCode(res, 200);
      expect(await bcrypt.compare(NEW_PASSWORD, await storedHash())).toBe(true);
    });

    it("answers 401 for an expired token and keeps the old password", async () => {
      const res = await callReset({
        newPassword: NEW_PASSWORD,
        resetToken: resetToken({ email }, RESET_SECRET, { expiresIn: -10 }),
      });
      await expectStatusCode(res, 401);
      expect((await res.json()).error.message).toBe("Reset token has expired.");
      expect(await bcrypt.compare(OLD_PASSWORD, await storedHash())).toBe(true);
    });

    it.each([
      ["a token that is not a JWT", () => "not-a-token"],
      [
        "a token signed with another secret",
        () => resetToken({ email }, "another-secret"),
      ],
      [
        "a token signed with the verification secret",
        () => resetToken({ email }, "cc1273-verification-secret"),
      ],
      [
        "an unsigned token",
        () => jwt.sign({ email }, "", { algorithm: "none" }),
      ],
    ])("answers 401 for %s", async (_name, makeToken) => {
      const res = await callReset({
        newPassword: NEW_PASSWORD,
        resetToken: makeToken(),
      });
      await expectStatusCode(res, 401);
      expect((await res.json()).error.message).toBe("Invalid reset token.");
      expect(await bcrypt.compare(OLD_PASSWORD, await storedHash())).toBe(true);
    });

    it("answers 404 when the token names an unknown user", async () => {
      const res = await callReset({
        newPassword: NEW_PASSWORD,
        resetToken: resetToken({ email: `nobody-${randomUUID()}@example.com` }),
      });
      await expectStatusCode(res, 404);
      expect((await res.json()).error.message).toBe("User not found!");
    });

    it("quirk: finds the user by the exact email in the token, so another case is a 404", async () => {
      const res = await callReset({
        newPassword: NEW_PASSWORD,
        resetToken: resetToken({ email: email.toUpperCase() }),
      });
      await expectStatusCode(res, 404);
    });

    it.each([
      ["without an upper case letter", "newpassw0rd"],
      ["without a digit", "NewPassword"],
      ["shorter than 4 characters", "Np1"],
    ])(
      "answers 400 for a new password %s and keeps the old one",
      async (_name, newPassword) => {
        const res = await callReset({ newPassword, resetToken: resetToken() });
        await expectStatusCode(res, 400);
        expect(await bcrypt.compare(OLD_PASSWORD, await storedHash())).toBe(
          true,
        );
      },
    );

    it("answers 400 when the token is missing", async () => {
      const res = await callReset({ newPassword: NEW_PASSWORD });
      await expectStatusCode(res, 400);
    });

    it("quirk: a token is not single use, so it works again within its hour", async () => {
      const token = resetToken();
      await expectStatusCode(
        await callReset({ newPassword: NEW_PASSWORD, resetToken: token }),
        200,
      );
      await expectStatusCode(
        await callReset({ newPassword: "Other1Password", resetToken: token }),
        200,
      );
      expect(await bcrypt.compare("Other1Password", await storedHash())).toBe(
        true,
      );
    });

    it("answers 500 when RESET_TOKEN_SECRET is not set", async () => {
      const token = resetToken();
      delete process.env.RESET_TOKEN_SECRET;
      const res = await callReset({
        newPassword: NEW_PASSWORD,
        resetToken: token,
      });
      await expectStatusCode(res, 500);
    });
  });
});
