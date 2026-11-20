/**
 * CC-1273: characterization tests for GET and POST /api/v1/auth/verify.
 *
 * GET gives a signed-in user a short-lived token. POST takes that token and a
 * password and says whether the password is the user's. These tests pin what
 * the routes do today, quirks included, so that moving them to the identity
 * service (CC-1279) can be checked against them. A test marked "quirk"
 * documents behavior that looks unintended; do not fix it here.
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
import { AppSession, Auth } from "@/lib/auth";
import { db } from "@/models";
import { Roles } from "@/util/types";
import {
  GET as getVerificationToken,
  POST as checkPassword,
} from "@/app/api/v1/auth/verify/route";
import {
  expectStatusCode,
  mockRequest,
  setupTests,
  teardownTests,
} from "../helpers";

const SECRET = "cc1273-verification-secret";
const PASSWORD = "Passw0rdTest";
const noParams = { params: Promise.resolve({}) };

describe("/api/v1/auth/verify", () => {
  const userId = randomUUID();
  const email = `verify-${randomUUID()}@example.com`;
  let savedSecret: string | undefined;

  function sessionFor(user: { id: string; email?: string }): AppSession {
    return {
      user: {
        id: user.id,
        name: "Verify Tester",
        email: user.email,
        role: Roles.User,
      },
      expires: new Date(Date.now() + 60_000).toISOString(),
    };
  }

  const signInAs = (session: AppSession | null) =>
    jest.spyOn(Auth, "getServerSession").mockResolvedValue(session);

  const getToken = () => getVerificationToken(mockRequest(), noParams);
  const check = (body: unknown) => checkPassword(mockRequest(body), noParams);

  /** A token as the GET route issues it. */
  const token = (
    payload: object = { email },
    secret = SECRET,
    options: jwt.SignOptions = { expiresIn: "1h" },
  ) => jwt.sign(payload, secret, options);

  beforeAll(async () => {
    setupTests();
    await db.initialize();
    await db.models.User.create({
      userId,
      name: "Verify Tester",
      email,
      passwordHash: await bcrypt.hash(PASSWORD, 4),
    });
  });

  afterAll(async () => {
    await db.models.User.destroy({ where: { userId } });
    teardownTests();
    await db.sequelize?.close();
  });

  beforeEach(() => {
    savedSecret = process.env.VERIFICATION_TOKEN_SECRET;
    process.env.VERIFICATION_TOKEN_SECRET = SECRET;
    signInAs(sessionFor({ id: userId, email }));
  });

  afterEach(() => {
    if (savedSecret === undefined) delete process.env.VERIFICATION_TOKEN_SECRET;
    else process.env.VERIFICATION_TOKEN_SECRET = savedSecret;
  });

  describe("GET: issue a verification token", () => {
    it("answers with a token that names the user's email and lasts one hour", async () => {
      const res = await getToken();
      await expectStatusCode(res, 200);
      const { verificationToken } = await res.json();

      const claims = jwt.verify(verificationToken, SECRET) as jwt.JwtPayload;
      expect(claims.email).toBe(email);
      expect(claims.exp! - claims.iat!).toBe(3600);
    });

    it("signs with the shared VERIFICATION_TOKEN_SECRET, so no other secret verifies it", async () => {
      const { verificationToken } = await (await getToken()).json();
      expect(() => jwt.verify(verificationToken, "another-secret")).toThrow();
      const header = jwt.decode(verificationToken, { complete: true })!.header;
      expect(header.alg).toBe("HS256");
    });

    it("quirk: with nobody signed in it answers 400, not the documented 401", async () => {
      signInAs(null);
      const res = await getToken();
      await expectStatusCode(res, 400);
      expect((await res.json()).error.message).toBe(
        "User doesn't have an email assigned!",
      );
    });

    it("answers 400 for a session without an email", async () => {
      signInAs(sessionFor({ id: userId }));
      await expectStatusCode(await getToken(), 400);
    });

    it("answers 404 when the session's email belongs to no user", async () => {
      signInAs(
        sessionFor({ id: userId, email: `nobody-${randomUUID()}@example.com` }),
      );
      const res = await getToken();
      await expectStatusCode(res, 404);
      expect((await res.json()).error.message).toBe("User not found!");
    });

    it("answers 500 when VERIFICATION_TOKEN_SECRET is not set", async () => {
      delete process.env.VERIFICATION_TOKEN_SECRET;
      await expectStatusCode(await getToken(), 500);
    });
  });

  describe("POST: check a password against a token", () => {
    it("says true for the user's password", async () => {
      const res = await check({ password: PASSWORD, token: token() });
      await expectStatusCode(res, 200);
      expect(await res.json()).toEqual({ comparePassword: true });
    });

    it("says false for another password, still with a 200", async () => {
      const res = await check({ password: "WrongPassw0rd", token: token() });
      await expectStatusCode(res, 200);
      expect(await res.json()).toEqual({ comparePassword: false });
    });

    it("works with a token the GET route issued", async () => {
      const { verificationToken } = await (await getToken()).json();
      const res = await check({ password: PASSWORD, token: verificationToken });
      expect(await res.json()).toEqual({ comparePassword: true });
    });

    it("needs no signed-in user: the token is the proof of identity", async () => {
      signInAs(null);
      const res = await check({ password: PASSWORD, token: token() });
      await expectStatusCode(res, 200);
      expect(await res.json()).toEqual({ comparePassword: true });
    });

    it("answers 404 when the token names an unknown user", async () => {
      const res = await check({
        password: PASSWORD,
        token: token({ email: `nobody-${randomUUID()}@example.com` }),
      });
      await expectStatusCode(res, 404);
      expect((await res.json()).error.message).toBe("User not found!");
    });

    it("quirk: an account with no password hash gets a 500", async () => {
      const bare = randomUUID();
      const bareEmail = `bare-${randomUUID()}@example.com`;
      await db.models.User.create({
        userId: bare,
        name: "No Password",
        email: bareEmail,
      });
      try {
        const res = await check({
          password: PASSWORD,
          token: token({ email: bareEmail }),
        });
        await expectStatusCode(res, 500);
      } finally {
        await db.models.User.destroy({ where: { userId: bare } });
      }
    });

    it("answers 400 for a password shorter than 4 characters", async () => {
      await expectStatusCode(
        await check({ password: "Pa1", token: token() }),
        400,
      );
    });

    it("answers 400 when the token is missing", async () => {
      await expectStatusCode(await check({ password: PASSWORD }), 400);
    });

    it("answers 500 when VERIFICATION_TOKEN_SECRET is not set", async () => {
      const issued = token();
      delete process.env.VERIFICATION_TOKEN_SECRET;
      await expectStatusCode(
        await check({ password: PASSWORD, token: issued }),
        500,
      );
    });

    // The OpenAPI text promises 401 for an invalid or expired token. The route
    // does not catch the error that jwt.verify throws, so it is a plain 500.
    it.each([
      ["an expired token", () => token({ email }, SECRET, { expiresIn: -10 })],
      ["a token that is not a JWT", () => "not-a-token"],
      [
        "a token signed with another secret",
        () => token({ email }, "another-secret"),
      ],
    ])(
      "quirk: %s answers 500, not the documented 401",
      async (_name, makeToken) => {
        const res = await check({ password: PASSWORD, token: makeToken() });
        await expectStatusCode(res, 500);
      },
    );

    it("quirk: accepts any token signed with the shared secret that names an email, such as an invite token", async () => {
      // Invites, email verification and this route all share
      // VERIFICATION_TOKEN_SECRET and nothing checks what a token is for.
      const inviteLike = token({
        email,
        reason: "invite",
        cityId: randomUUID(),
      });
      const res = await check({ password: PASSWORD, token: inviteLike });
      await expectStatusCode(res, 200);
      expect(await res.json()).toEqual({ comparePassword: true });
    });
  });
});
