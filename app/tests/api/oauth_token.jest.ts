import { POST as postToken } from "@/app/api/v1/token/route";
import { db } from "@/models";
import { OAuthClient } from "@/models/OAuthClient";
import { OAuthClientAuthz } from "@/models/OAuthClientAuthz";
import { UsedAuthorizationCode } from "@/models/UsedAuthorizationCode";
import { FeatureFlags, setFeatureFlag } from "@/util/feature-flags";
import { afterAll, beforeAll, describe, expect, it } from "@jest/globals";
import jwt from "jsonwebtoken";
import { createHash, randomBytes } from "node:crypto";
import { v4 } from "uuid";
import {
  OAuthTokenType,
  signOAuthToken,
  verifyOAuthToken,
} from "@/lib/auth/oauth-signing";
import {
  expectStatusCode,
  mockRequestFormData,
  setupOAuthSigningKey,
  setupTests,
  testUserID,
} from "../helpers";

const testClient = {
  clientId: "test-token-client",
  redirectURI: "https://token-test.example/redirect",
};

const codeVerifier = randomBytes(32).toString("base64url");
const codeChallenge = createHash("sha256")
  .update(codeVerifier, "ascii")
  .digest("base64url");

/** Signs a code. Pass `secret` to sign it with the shared secret instead of the OAuth key. */
function createCode(jwtid: string, secret?: string): string {
  const origin = process.env.HOST || "http://localhost:3000";
  const payload = {
    client_id: testClient.clientId,
    redirect_uri: testClient.redirectURI,
    scope: "read",
    code_challenge: codeChallenge,
  };
  const options = {
    expiresIn: "5m" as const,
    issuer: origin,
    audience: origin,
    subject: testUserID,
    jwtid,
  };
  return secret
    ? jwt.sign(payload, secret, options)
    : signOAuthToken(OAuthTokenType.Code, payload, options);
}

function tokenRequest(code: string) {
  const formData = new FormData();
  formData.append("grant_type", "authorization_code");
  formData.append("code", code);
  formData.append("redirect_uri", testClient.redirectURI);
  formData.append("client_id", testClient.clientId);
  formData.append("code_verifier", codeVerifier);
  const req = mockRequestFormData(formData);
  req.headers.set("content-type", "application/x-www-form-urlencoded");
  return req;
}

describe("OAuth token API", () => {
  let oldFeatureFlag: boolean;
  const usedJwtIds: string[] = [];

  beforeAll(async () => {
    setupTests();
    setupOAuthSigningKey();
    await db.initialize();
    oldFeatureFlag = setFeatureFlag(FeatureFlags.OAUTH_ENABLED, true);
    await OAuthClient.destroy({ where: { clientId: testClient.clientId } });
    await OAuthClient.create(testClient);
  });

  afterAll(async () => {
    await UsedAuthorizationCode.destroy({ where: { jwtId: usedJwtIds } });
    await OAuthClient.destroy({ where: { clientId: testClient.clientId } });
    setFeatureFlag(FeatureFlags.OAUTH_ENABLED, oldFeatureFlag);
    await db.sequelize?.close();
  });

  it("exchanges an authorization code once and rejects a replay", async () => {
    const jwtId = v4();
    usedJwtIds.push(jwtId);
    const code = createCode(jwtId);

    const first = await postToken(tokenRequest(code), {
      params: Promise.resolve({}),
    });
    await expectStatusCode(first, 200);
    const body = await first.json();
    expect(body.access_token).toBeDefined();
    expect(body.refresh_token).toBeDefined();

    // The used code is persisted in the database (shared by all replicas),
    // not in process memory.
    const row = await UsedAuthorizationCode.findByPk(jwtId);
    expect(row).not.toBeNull();

    const replay = await postToken(tokenRequest(code), {
      params: Promise.resolve({}),
    });
    await expectStatusCode(replay, 400);
    const replayBody = await replay.json();
    expect(replayBody.error.message).toEqual("Single-use code.");
  });

  it("signs access and refresh tokens with the OAuth key, not the shared secret", async () => {
    const jwtId = v4();
    usedJwtIds.push(jwtId);

    const res = await postToken(tokenRequest(createCode(jwtId)), {
      params: Promise.resolve({}),
    });
    await expectStatusCode(res, 200);
    const body = await res.json();

    for (const token of [body.access_token, body.refresh_token]) {
      const decoded = jwt.decode(token, { complete: true });
      expect(decoded?.header.alg).toBe("RS256");
      expect(decoded?.header.kid).toBeTruthy();
      // Verifies with the OAuth key and carries the user and client.
      const payload = verifyOAuthToken(
        token,
        token === body.access_token
          ? OAuthTokenType.Access
          : OAuthTokenType.Refresh,
      );
      expect(payload.sub).toBe(testUserID);
      expect(payload.client_id).toBe(testClient.clientId);
      // The shared secret must not verify it.
      expect(() =>
        jwt.verify(token, process.env.VERIFICATION_TOKEN_SECRET ?? "unset"),
      ).toThrow();
    }
  });

  it("rejects a code signed with the shared secret", async () => {
    const jwtId = v4();
    usedJwtIds.push(jwtId);
    const secret = process.env.VERIFICATION_TOKEN_SECRET ?? "test-secret";

    const res = await postToken(tokenRequest(createCode(jwtId, secret)), {
      params: Promise.resolve({}),
    });
    await expectStatusCode(res, 400);
    // The code was never accepted, so it was not recorded as used.
    expect(await UsedAuthorizationCode.findByPk(jwtId)).toBeNull();
  });

  it("rejects a code already recorded as used by another instance", async () => {
    const jwtId = v4();
    usedJwtIds.push(jwtId);
    await UsedAuthorizationCode.create({
      jwtId,
      expires: new Date(Date.now() + 5 * 60 * 1000),
    });

    const res = await postToken(tokenRequest(createCode(jwtId)), {
      params: Promise.resolve({}),
    });
    await expectStatusCode(res, 400);
  });

  it("prunes expired used-code records", async () => {
    const staleJwtId = v4();
    usedJwtIds.push(staleJwtId);
    await UsedAuthorizationCode.create({
      jwtId: staleJwtId,
      expires: new Date(Date.now() - 60 * 1000),
    });

    const jwtId = v4();
    usedJwtIds.push(jwtId);
    const res = await postToken(tokenRequest(createCode(jwtId)), {
      params: Promise.resolve({}),
    });
    await expectStatusCode(res, 200);

    expect(await UsedAuthorizationCode.findByPk(staleJwtId)).toBeNull();
  });

  describe("refresh_token grant accepts only refresh tokens", () => {
    // The refresh grant checks that the user authorized the client.
    beforeAll(async () => {
      await db.models.User.upsert({ userId: testUserID, name: "TEST_USER" });
      await OAuthClientAuthz.upsert({
        clientId: testClient.clientId,
        userId: testUserID,
        lastUsed: new Date(),
      });
    });

    afterAll(async () => {
      await OAuthClientAuthz.destroy({
        where: { clientId: testClient.clientId, userId: testUserID },
      });
    });

    function refreshRequest(token: string) {
      const formData = new FormData();
      formData.append("grant_type", "refresh_token");
      formData.append("refresh_token", token);
      const req = mockRequestFormData(formData);
      req.headers.set("content-type", "application/x-www-form-urlencoded");
      return req;
    }

    async function issueTokens() {
      const jwtId = v4();
      usedJwtIds.push(jwtId);
      const res = await postToken(tokenRequest(createCode(jwtId)), {
        params: Promise.resolve({}),
      });
      await expectStatusCode(res, 200);
      return res.json();
    }

    it("accepts a refresh token", async () => {
      const { refresh_token } = await issueTokens();
      const res = await postToken(refreshRequest(refresh_token), {
        params: Promise.resolve({}),
      });
      await expectStatusCode(res, 200);
    });

    it("rejects an authorization code, which would skip PKCE and single use", async () => {
      // An unused code, so nothing but its type can stop it.
      const code = createCode(v4());
      const res = await postToken(refreshRequest(code), {
        params: Promise.resolve({}),
      });
      await expectStatusCode(res, 400);
    });

    it("rejects an access token, so access cannot be renewed with itself", async () => {
      const { access_token } = await issueTokens();
      const res = await postToken(refreshRequest(access_token), {
        params: Promise.resolve({}),
      });
      await expectStatusCode(res, 400);
    });
  });

  it("rejects a refresh token or an access token presented as an authorization code", async () => {
    const { access_token, refresh_token } = await (async () => {
      const jwtId = v4();
      usedJwtIds.push(jwtId);
      const res = await postToken(tokenRequest(createCode(jwtId)), {
        params: Promise.resolve({}),
      });
      return res.json();
    })();

    for (const token of [access_token, refresh_token]) {
      const res = await postToken(tokenRequest(token), {
        params: Promise.resolve({}),
      });
      await expectStatusCode(res, 400);
    }
  });
});
