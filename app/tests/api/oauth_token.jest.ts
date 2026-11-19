import { POST as postAuthCode } from "@/app/api/v1/auth/code/route";
import { POST as postToken } from "@/app/api/v1/token/route";
import {
  GET as getUserinfo,
  POST as postUserinfo,
} from "@/app/api/v1/oauth/userinfo/route";
import { Auth, AppSession } from "@/lib/auth";
import { db } from "@/models";
import { AuthorizationCode } from "@/models/AuthorizationCode";
import { OAuthClient } from "@/models/OAuthClient";
import { OAuthClientAuthz } from "@/models/OAuthClientAuthz";
import AuthorizationCodeService from "@/backend/oauth/AuthorizationCodeService";
import { FeatureFlags, setFeatureFlag } from "@/util/feature-flags";
import { afterAll, beforeAll, describe, expect, it, jest } from "@jest/globals";
import jwt from "jsonwebtoken";
import { createHash, createHmac, randomBytes, randomUUID } from "node:crypto";
import {
  OAuthTokenType,
  signOAuthToken,
  verifyOAuthToken,
} from "@/lib/auth/oauth-signing";
import {
  expectStatusCode,
  mockRequest,
  mockRequestFormData,
  setupOAuthSigningKey,
  setupTests,
  teardownTests,
} from "../helpers";

const testClient = {
  clientId: "test-token-client",
  redirectURI: "https://token-test.example/redirect",
};

// A user of its own, so the tests never depend on (or touch) shared fixtures.
const userId = randomUUID();
const userEmail = `oauth-token-${userId}@example.com`;
const csrfSecret = "test-csrf-secret";
const csrfToken = createHmac("sha256", csrfSecret).digest("hex");

const codeVerifier = randomBytes(32).toString("base64url");
const codeChallenge = createHash("sha256")
  .update(codeVerifier, "ascii")
  .digest("base64url");

const noParams = { params: Promise.resolve({}) };

/** Asks /auth/code for a code, as the signed-in test user. */
async function issueCode(
  overrides: Record<string, unknown> = {},
): Promise<Response> {
  const body = {
    clientId: testClient.clientId,
    redirectUri: testClient.redirectURI,
    codeChallenge,
    scope: "read",
    csrfToken,
    ...overrides,
  };
  return postAuthCode(mockRequest(body), noParams);
}

async function issueCodeValue(
  overrides: Record<string, unknown> = {},
): Promise<string> {
  const res = await issueCode(overrides);
  await expectStatusCode(res, 200);
  return (await res.json()).data.code;
}

function tokenRequest(code: string, overrides: Record<string, string> = {}) {
  const fields: Record<string, string> = {
    grant_type: "authorization_code",
    code,
    redirect_uri: testClient.redirectURI,
    client_id: testClient.clientId,
    code_verifier: codeVerifier,
    ...overrides,
  };
  const formData = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    formData.append(key, value);
  }
  const req = mockRequestFormData(formData);
  req.headers.set("content-type", "application/x-www-form-urlencoded");
  return req;
}

function refreshRequest(refreshToken: string) {
  const formData = new FormData();
  formData.append("grant_type", "refresh_token");
  formData.append("refresh_token", refreshToken);
  const req = mockRequestFormData(formData);
  req.headers.set("content-type", "application/x-www-form-urlencoded");
  return req;
}

function bearer(token: string) {
  return mockRequest(undefined, undefined, {
    authorization: `Bearer ${token}`,
  });
}

/** Runs the whole flow and returns the token response body. */
async function exchange(
  scope: string,
  nonce?: string,
): Promise<Record<string, string>> {
  const code = await issueCodeValue({ scope, ...(nonce ? { nonce } : {}) });
  const res = await postToken(tokenRequest(code), noParams);
  await expectStatusCode(res, 200);
  return res.json();
}

describe("OAuth authorization code and token API", () => {
  let oldFeatureFlag: boolean;

  beforeAll(async () => {
    setupTests();
    setupOAuthSigningKey();
    await db.initialize();
    oldFeatureFlag = setFeatureFlag(FeatureFlags.OAUTH_ENABLED, true);

    await db.models.User.upsert({
      userId,
      name: "OAuth Token Tester",
      email: userEmail,
    });
    await OAuthClient.destroy({ where: { clientId: testClient.clientId } });
    await OAuthClient.create(testClient);

    // /auth/code needs a session that carries the CSRF secret.
    const expires = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    jest.spyOn(Auth, "getServerSession").mockResolvedValue({
      user: { id: userId, name: "OAuth Token Tester", email: userEmail },
      csrfSecret,
      expires,
    } as unknown as AppSession);
  });

  afterAll(async () => {
    await AuthorizationCode.destroy({ where: { userId } });
    await OAuthClientAuthz.destroy({ where: { userId } });
    await OAuthClient.destroy({ where: { clientId: testClient.clientId } });
    await db.models.User.destroy({ where: { userId } });
    setFeatureFlag(FeatureFlags.OAUTH_ENABLED, oldFeatureFlag);
    teardownTests();
    await db.sequelize?.close();
  });

  describe("POST /api/v1/auth/code", () => {
    it("stores only the hash of the code, valid for 60 seconds", async () => {
      const code = await issueCodeValue({ scope: "openid read", nonce: "n-1" });

      const hash = createHash("sha256").update(code).digest("hex");
      expect(await AuthorizationCode.findByPk(code)).toBeNull();

      const row = await AuthorizationCode.findByPk(hash);
      expect(row).not.toBeNull();
      expect(row!.userId).toBe(userId);
      expect(row!.clientId).toBe(testClient.clientId);
      expect(row!.scope).toBe("openid read");
      expect(row!.nonce).toBe("n-1");
      expect(row!.consumedAt).toBeNull();
      const lifetime = row!.expires.getTime() - Date.now();
      expect(lifetime).toBeGreaterThan(50_000);
      expect(lifetime).toBeLessThanOrEqual(60_000);
    });

    it("records that the user authorized the client", async () => {
      await issueCodeValue();
      const authz = await OAuthClientAuthz.findOne({
        where: { clientId: testClient.clientId, userId },
      });
      expect(authz).not.toBeNull();
    });

    it("rejects an unknown scope", async () => {
      await expectStatusCode(await issueCode({ scope: "read admin" }), 400);
    });

    it("rejects a malformed code challenge", async () => {
      await expectStatusCode(await issueCode({ codeChallenge: "short" }), 400);
    });

    it("rejects a wrong CSRF token", async () => {
      await expectStatusCode(await issueCode({ csrfToken: "nope" }), 400);
    });

    it("rejects a redirect URI that is not the registered one", async () => {
      const res = await issueCode({ redirectUri: "https://evil.example/cb" });
      await expectStatusCode(res, 400);
    });

    it("rejects an unknown client", async () => {
      await expectStatusCode(await issueCode({ clientId: "no-such" }), 400);
    });
  });

  describe("POST /api/v1/token (authorization_code)", () => {
    it("exchanges a code once and rejects a replay", async () => {
      const code = await issueCodeValue();

      const first = await postToken(tokenRequest(code), noParams);
      await expectStatusCode(first, 200);
      const body = await first.json();
      expect(body.access_token).toBeDefined();
      expect(body.refresh_token).toBeDefined();
      expect(body.scope).toBe("read");

      const hash = createHash("sha256").update(code).digest("hex");
      expect(
        (await AuthorizationCode.findByPk(hash))!.consumedAt,
      ).not.toBeNull();

      const replay = await postToken(tokenRequest(code), noParams);
      await expectStatusCode(replay, 400);
      expect((await replay.json()).error.message).toEqual("Single-use code.");
    });

    it("lets only one of two concurrent requests redeem a code", async () => {
      const code = await issueCodeValue();
      const results = await Promise.all([
        postToken(tokenRequest(code), noParams),
        postToken(tokenRequest(code), noParams),
      ]);
      const statuses = results.map((r) => r.status).sort();
      expect(statuses).toEqual([200, 400]);
    });

    it("rejects an expired code", async () => {
      const code = await issueCodeValue();
      const hash = createHash("sha256").update(code).digest("hex");
      await AuthorizationCode.update(
        { expires: new Date(Date.now() - 1000) },
        { where: { codeHash: hash } },
      );
      const res = await postToken(tokenRequest(code), noParams);
      await expectStatusCode(res, 400);
      expect((await res.json()).error.message).toEqual("Code has expired.");
    });

    it("rejects an unknown code", async () => {
      const res = await postToken(tokenRequest("not-a-real-code"), noParams);
      await expectStatusCode(res, 400);
    });

    it("rejects a wrong PKCE verifier, and the code is then spent", async () => {
      const code = await issueCodeValue();
      const wrong = await postToken(
        tokenRequest(code, {
          code_verifier: randomBytes(32).toString("base64url"),
        }),
        noParams,
      );
      await expectStatusCode(wrong, 400);
      // Even the right verifier no longer works: one attempt per code.
      const retry = await postToken(tokenRequest(code), noParams);
      await expectStatusCode(retry, 400);
    });

    it("rejects a code presented by another client", async () => {
      const other = {
        clientId: "test-token-other",
        redirectURI: "https://token-test-other.example/redirect",
      };
      await OAuthClient.destroy({ where: { clientId: other.clientId } });
      await OAuthClient.create(other);
      try {
        const code = await issueCodeValue();
        // The other client's own redirect URI passes the route's checks, so
        // the code's binding to the first client is what rejects it.
        const res = await postToken(
          tokenRequest(code, {
            client_id: other.clientId,
            redirect_uri: other.redirectURI,
          }),
          noParams,
        );
        await expectStatusCode(res, 400);
        expect((await res.json()).error.message).toBe(
          "client_id mismatch with code.",
        );
      } finally {
        await OAuthClient.destroy({ where: { clientId: other.clientId } });
      }
    });

    it("rejects a redirect URI that differs from the registered one", async () => {
      const code = await issueCodeValue();
      const res = await postToken(
        tokenRequest(code, { redirect_uri: "https://evil.example/cb" }),
        noParams,
      );
      await expectStatusCode(res, 400);
    });

    it("rejects a JWT passed as a code", async () => {
      const origin = process.env.HOST || "http://localhost:3000";
      const forged = signOAuthToken(
        OAuthTokenType.Access,
        { client_id: testClient.clientId, scope: "read" },
        { expiresIn: "5m", issuer: origin, audience: origin, subject: userId },
      );
      const res = await postToken(tokenRequest(forged), noParams);
      await expectStatusCode(res, 400);
    });

    it("signs access and refresh tokens with the OAuth key", async () => {
      const body = await exchange("read");
      for (const token of [body.access_token, body.refresh_token]) {
        const decoded = jwt.decode(token, { complete: true });
        expect(decoded?.header.alg).toBe("RS256");
        expect(decoded?.header.kid).toBeTruthy();
        const payload = verifyOAuthToken(
          token,
          token === body.access_token
            ? OAuthTokenType.Access
            : OAuthTokenType.Refresh,
        );
        expect(payload.sub).toBe(userId);
        expect(payload.client_id).toBe(testClient.clientId);
        expect(() =>
          jwt.verify(token, process.env.VERIFICATION_TOKEN_SECRET ?? "unset"),
        ).toThrow();
      }
    });

    it("returns no id_token without the openid scope", async () => {
      const body = await exchange("read write");
      expect(body.id_token).toBeUndefined();
    });

    it("returns an id_token for the openid scope, with the nonce", async () => {
      const body = await exchange("openid read", "nonce-abc");
      expect(body.id_token).toBeDefined();

      const header = jwt.decode(body.id_token, { complete: true })!.header;
      expect(header.alg).toBe("RS256");

      const claims = verifyOAuthToken(body.id_token, OAuthTokenType.Id);
      const origin = process.env.HOST || "http://localhost:3000";
      expect(claims.iss).toBe(origin);
      expect(claims.aud).toBe(testClient.clientId);
      expect(claims.sub).toBe(userId);
      expect(claims.nonce).toBe("nonce-abc");
      expect(claims.email).toBe(userEmail);
      expect(claims.name).toBe("OAuth Token Tester");
      expect(claims.org_ids).toEqual([]);
      expect(claims.amr).toEqual(["pwd"]);
      expect(claims.email_verified).toBeUndefined();
      // 15 minutes
      expect(claims.exp! - claims.iat!).toBe(15 * 60);
    });

    it("omits the nonce claim when none was sent", async () => {
      const body = await exchange("openid");
      expect(
        verifyOAuthToken(body.id_token, OAuthTokenType.Id).nonce,
      ).toBeUndefined();
    });

    it("reports a second factor in amr", async () => {
      await db.models.User.update(
        { twoFactorEnabled: true, twoFactorSecret: "secret" },
        { where: { userId } },
      );
      try {
        const body = await exchange("openid");
        expect(verifyOAuthToken(body.id_token, OAuthTokenType.Id).amr).toEqual([
          "pwd",
          "otp",
        ]);
      } finally {
        await db.models.User.update(
          { twoFactorEnabled: false, twoFactorSecret: null },
          { where: { userId } },
        );
      }
    });

    it("returns 500, not a code error, when the signing key is missing", async () => {
      const code = await issueCodeValue();
      const key = process.env.OAUTH_SIGNING_KEY;
      delete process.env.OAUTH_SIGNING_KEY;
      try {
        const res = await postToken(tokenRequest(code), noParams);
        await expectStatusCode(res, 500);
      } finally {
        process.env.OAUTH_SIGNING_KEY = key;
      }
      // The code was not used up by the failed attempt.
      const retry = await postToken(tokenRequest(code), noParams);
      await expectStatusCode(retry, 200);
    });
  });

  describe("AuthorizationCodeService housekeeping", () => {
    it("removes codes that expired long ago when issuing a new one", async () => {
      const staleHash = createHash("sha256").update("stale").digest("hex");
      await AuthorizationCode.create({
        codeHash: staleHash,
        clientId: testClient.clientId,
        userId,
        redirectURI: testClient.redirectURI,
        codeChallenge,
        scope: "read",
        expires: new Date(Date.now() - 60 * 60 * 1000),
      });
      await AuthorizationCodeService.issue({
        clientId: testClient.clientId,
        userId,
        redirectUri: testClient.redirectURI,
        codeChallenge,
        scope: "read",
      });
      expect(await AuthorizationCode.findByPk(staleHash)).toBeNull();
    });
  });

  describe("token types", () => {
    it("rejects an access token or an id_token as a refresh token", async () => {
      const body = await exchange("openid read");
      for (const token of [body.access_token, body.id_token]) {
        const res = await postToken(refreshRequest(token), noParams);
        await expectStatusCode(res, 400);
      }
    });

    it("rejects an unused authorization code as a refresh token", async () => {
      const code = await issueCodeValue();
      await expectStatusCode(
        await postToken(refreshRequest(code), noParams),
        400,
      );
      // The attempt did not spend the code.
      await expectStatusCode(
        await postToken(tokenRequest(code), noParams),
        200,
      );
    });

    it("rejects a refresh token as a bearer token", async () => {
      const body = await exchange("openid read");
      await expectStatusCode(
        await getUserinfo(bearer(body.refresh_token), noParams),
        401,
      );
    });

    it("rejects an access token or a refresh token as an authorization code", async () => {
      const body = await exchange("read");
      for (const token of [body.access_token, body.refresh_token]) {
        await expectStatusCode(
          await postToken(tokenRequest(token), noParams),
          400,
        );
      }
    });

    it("types the tokens it issues", async () => {
      const body = await exchange("openid read");
      const typ = (token: string) =>
        jwt.decode(token, { complete: true })!.header.typ;
      expect(typ(body.access_token)).toBe(OAuthTokenType.Access);
      expect(typ(body.refresh_token)).toBe(OAuthTokenType.Refresh);
      expect(typ(body.id_token)).toBe(OAuthTokenType.Id);
    });
  });

  describe("POST /api/v1/token (refresh_token)", () => {
    it("still issues a new access token, without an id_token", async () => {
      const body = await exchange("openid read");
      const res = await postToken(refreshRequest(body.refresh_token), noParams);
      await expectStatusCode(res, 200);
      const refreshed = await res.json();
      expect(refreshed.access_token).toBeDefined();
      expect(refreshed.id_token).toBeUndefined();
      expect(refreshed.scope).toBe("openid read");
    });
  });

  describe("/api/v1/oauth/userinfo", () => {
    it("returns the claims for an access token with the openid scope", async () => {
      const body = await exchange("openid read");
      const res = await getUserinfo(bearer(body.access_token), noParams);
      await expectStatusCode(res, 200);
      expect(res.headers.get("Cache-Control")).toBe("no-store");
      expect(await res.json()).toEqual({
        sub: userId,
        email: userEmail,
        name: "OAuth Token Tester",
        org_ids: [],
      });
    });

    it("accepts POST with only the openid scope", async () => {
      const body = await exchange("openid");
      const res = await postUserinfo(bearer(body.access_token), noParams);
      await expectStatusCode(res, 200);
      expect((await res.json()).sub).toBe(userId);
    });

    it("rejects a token without the openid scope", async () => {
      const body = await exchange("read write");
      await expectStatusCode(
        await getUserinfo(bearer(body.access_token), noParams),
        401,
      );
    });

    it("rejects a request without a bearer token, even with a browser session", async () => {
      // The mocked session stands for a signed-in browser.
      await expectStatusCode(await getUserinfo(mockRequest(), noParams), 401);
    });

    it("rejects an id_token used as a bearer token", async () => {
      const body = await exchange("openid read write");
      // aud is the client id, not this server.
      await expectStatusCode(
        await getUserinfo(bearer(body.id_token), noParams),
        401,
      );
    });
  });
});
