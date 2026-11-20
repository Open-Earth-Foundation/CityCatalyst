/**
 * CC-1273: characterization tests for how apiHandler treats an OAuth access
 * token (getBearerToken and makeOAuthUserSession in util/api.ts).
 *
 * These pin behavior that must survive moving token checks out of this app
 * (CC-1278, CC-1281): which tokens are accepted, which scope each HTTP method
 * needs, revocation, and what the session carries. They use the local signing
 * key. Behavior that is meant to change is left out on purpose: the session's
 * `expires`, the status for a deleted user, and the separate client lookup.
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
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/models";
import { OAuthClient } from "@/models/OAuthClient";
import { OAuthClientAuthz } from "@/models/OAuthClientAuthz";
import { OAuthTokenType, signOAuthToken } from "@/lib/auth/oauth-signing";
import { apiHandler } from "@/util/api";
import { FeatureFlags, setFeatureFlag } from "@/util/feature-flags";
import {
  expectStatusCode,
  setupOAuthSigningKey,
  setupTests,
  teardownTests,
} from "../helpers";

const ORIGIN = "http://localhost:3000";
const USER_ID = "33333333-3333-4333-8333-333333333333";
const CLIENT_ID = "oauth-bearer-test-client";

describe("OAuth access tokens in apiHandler", () => {
  const saved: Record<string, string | undefined> = {};
  let oldFeatureFlag: boolean;
  let grantUpdate: ReturnType<typeof jest.fn>;
  let findGrant: ReturnType<typeof jest.spyOn>;
  let findUser: ReturnType<typeof jest.spyOn>;

  // Reports the session, so tests can see what a token turned into.
  const handler = apiHandler(async (_req, { session }) =>
    NextResponse.json({ user: session?.user ?? null }),
  );

  function call(token: string, method = "GET") {
    const req = new NextRequest(`${ORIGIN}/api/v1/oauth-bearer-test`, {
      method,
      headers: { Authorization: `Bearer ${token}` },
    });
    return handler(req, { params: Promise.resolve({}) });
  }

  /** An access token as the token endpoint issues it, with knobs to break it. */
  function accessToken(
    options: {
      scope?: string | null;
      audience?: string;
      expiresIn?: number;
    } = {},
  ) {
    const claims: Record<string, unknown> = { client_id: CLIENT_ID };
    if (options.scope !== null) claims.scope = options.scope ?? "read write";
    return signOAuthToken(OAuthTokenType.Access, claims, {
      expiresIn: options.expiresIn ?? 900,
      issuer: ORIGIN,
      audience: options.audience ?? ORIGIN,
      subject: USER_ID,
    });
  }

  beforeAll(async () => {
    setupTests();
    await db.initialize();
    oldFeatureFlag = setFeatureFlag(FeatureFlags.OAUTH_ENABLED, true);
  });

  afterAll(async () => {
    setFeatureFlag(FeatureFlags.OAUTH_ENABLED, oldFeatureFlag);
    teardownTests();
    await db.sequelize?.close();
  });

  beforeEach(() => {
    for (const name of ["HOST", "OAUTH_SIGNING_KEY"]) {
      saved[name] = process.env[name];
    }
    process.env.HOST = ORIGIN;
    setupOAuthSigningKey();

    // No database: the client, the grant and the user are stubbed.
    jest
      .spyOn(OAuthClient, "findByPk")
      .mockResolvedValue({ clientId: CLIENT_ID } as never);
    grantUpdate = jest.fn(async () => undefined);
    findGrant = jest
      .spyOn(OAuthClientAuthz, "findOne")
      .mockResolvedValue({ update: grantUpdate } as never);
    findUser = jest.spyOn(db.models.User, "findOne").mockResolvedValue({
      userId: USER_ID,
      name: "Bearer Tester",
      email: "bearer@example.org",
      pictureUrl: "https://example.org/me.png",
      role: "admin",
    } as never);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    for (const [name, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  });

  describe("a valid token", () => {
    it("becomes a session for the token's user, with profile and role from the user row", async () => {
      const res = await call(accessToken());
      await expectStatusCode(res, 200);
      expect((await res.json()).user).toEqual({
        id: USER_ID,
        name: "Bearer Tester",
        email: "bearer@example.org",
        image: "https://example.org/me.png",
        role: "admin",
      });
    });

    it("gives a user with no stored role the plain user role", async () => {
      findUser.mockResolvedValue({
        userId: USER_ID,
        name: "No Role",
        email: "norole@example.org",
        pictureUrl: null,
        role: null,
      } as never);
      const res = await call(accessToken());
      expect((await res.json()).user.role).toBe("user");
    });

    it("looks up the grant for this client and user, and records that it was used", async () => {
      await call(accessToken());
      expect(findGrant).toHaveBeenCalledWith({
        where: { clientId: CLIENT_ID, userId: USER_ID },
      });
      expect(grantUpdate).toHaveBeenCalledTimes(1);
      const [update] = grantUpdate.mock.calls[0] as [{ lastUsed: Date }];
      expect(update.lastUsed).toBeInstanceOf(Date);
    });
  });

  describe("tokens that are refused", () => {
    it("answers 401 for an expired token", async () => {
      await expectStatusCode(await call(accessToken({ expiresIn: -60 })), 401);
    });

    it("answers 401 for a token meant for another server", async () => {
      const token = accessToken({ audience: "https://other-server.example" });
      await expectStatusCode(await call(token), 401);
    });

    it("answers 401 for a token with no scope", async () => {
      const res = await call(accessToken({ scope: null }));
      await expectStatusCode(res, 401);
      expect((await res.json()).error.message).toBe("Token missing scope");
    });

    it("answers 401 once the user has revoked the app, even though the token has not expired", async () => {
      findGrant.mockResolvedValue(null as never);
      const res = await call(accessToken());
      await expectStatusCode(res, 401);
      expect((await res.json()).error.message).toBe("Authorization revoked");
    });

    it("answers 401 when OAuth is switched off, even for a valid token", async () => {
      setFeatureFlag(FeatureFlags.OAUTH_ENABLED, false);
      try {
        await expectStatusCode(await call(accessToken()), 401);
      } finally {
        setFeatureFlag(FeatureFlags.OAUTH_ENABLED, true);
      }
    });

    it("does not look up the grant or the user for a token it refuses", async () => {
      await call(accessToken({ expiresIn: -60 }));
      expect(findGrant).not.toHaveBeenCalled();
      expect(findUser).not.toHaveBeenCalled();
    });
  });

  describe("which scope each HTTP method needs", () => {
    it.each(["GET", "HEAD"])("%s needs read", async (method) => {
      await expectStatusCode(
        await call(accessToken({ scope: "read" }), method),
        200,
      );
      const res = await call(accessToken({ scope: "write" }), method);
      await expectStatusCode(res, 401);
    });

    it.each(["POST", "PUT", "PATCH", "DELETE"])(
      "%s needs write",
      async (method) => {
        await expectStatusCode(
          await call(accessToken({ scope: "write" }), method),
          200,
        );
        const res = await call(accessToken({ scope: "read" }), method);
        await expectStatusCode(res, 401);
      },
    );

    it("tells the caller which scope is missing", async () => {
      const noRead = await call(accessToken({ scope: "write" }), "GET");
      expect((await noRead.json()).error.message).toBe(
        "No read scope available",
      );
      const noWrite = await call(accessToken({ scope: "read" }), "POST");
      expect((await noWrite.json()).error.message).toBe(
        "No write scope available",
      );
    });

    it("lets a token with both scopes use every method", async () => {
      for (const method of ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE"]) {
        await expectStatusCode(await call(accessToken(), method), 200);
      }
    });

    it("quirk: a token with only other scopes is refused for GET and POST but not checked for OPTIONS", async () => {
      const token = accessToken({ scope: "openid" });
      await expectStatusCode(await call(token, "GET"), 401);
      await expectStatusCode(await call(token, "POST"), 401);
      await expectStatusCode(await call(token, "OPTIONS"), 200);
    });
  });
});
