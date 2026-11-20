/**
 * CC-1277: refresh rotation side effects (revocation + introspection).
 */
import { POST as postToken } from "@/app/api/v1/token/route";
import { POST as postRevoke } from "@/app/api/v1/oauth/revoke/route";
import { POST as postIntrospect } from "@/app/api/v1/oauth/introspect/route";
import { POST as postAuthCode } from "@/app/api/v1/auth/code/route";
import { Auth, AppSession } from "@/lib/auth";
import { db } from "@/models";
import { AuthorizationCode } from "@/models/AuthorizationCode";
import { OAuthClient } from "@/models/OAuthClient";
import { OAuthClientAuthz } from "@/models/OAuthClientAuthz";
import { RefreshToken } from "@/models/RefreshToken";
import { FeatureFlags, setFeatureFlag } from "@/util/feature-flags";
import { afterAll, beforeAll, describe, expect, it, jest } from "@jest/globals";
import { createHash, createHmac, randomBytes, randomUUID } from "node:crypto";
import {
  expectStatusCode,
  mockRequest,
  mockRequestFormData,
  setupOAuthSigningKey,
  setupTests,
  teardownTests,
} from "../helpers";

const testClient = {
  clientId: "test-lifecycle-client",
  redirectURI: "https://lifecycle-test.example/redirect",
};

const resourceServer = {
  id: "test-rs",
  secret: "rs-secret-for-lifecycle-tests",
};

const userId = randomUUID();
const userEmail = `oauth-lifecycle-${userId}@example.com`;
const csrfSecret = "test-csrf-secret";
const csrfToken = createHmac("sha256", csrfSecret).digest("hex");

const codeVerifier = randomBytes(32).toString("base64url");
const codeChallenge = createHash("sha256")
  .update(codeVerifier, "ascii")
  .digest("base64url");

const noParams = { params: Promise.resolve({}) };

function formRequest(
  fields: Record<string, string>,
  headers: Record<string, string> = {},
) {
  const formData = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    formData.append(key, value);
  }
  const req = mockRequestFormData(formData);
  req.headers.set("content-type", "application/x-www-form-urlencoded");
  for (const [key, value] of Object.entries(headers)) {
    req.headers.set(key, value);
  }
  return req;
}

function basicAuth(id: string, secret: string): string {
  return `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`;
}

async function issueTokens(): Promise<{
  access_token: string;
  refresh_token: string;
}> {
  const codeResponse = await postAuthCode(
    mockRequest({
      clientId: testClient.clientId,
      redirectUri: testClient.redirectURI,
      codeChallenge,
      scope: "openid read",
      csrfToken,
    }),
    noParams,
  );
  await expectStatusCode(codeResponse, 200);
  const { data } = await codeResponse.json();

  const tokenRes = await postToken(
    formRequest({
      grant_type: "authorization_code",
      code: data.code,
      redirect_uri: testClient.redirectURI,
      client_id: testClient.clientId,
      code_verifier: codeVerifier,
    }),
    noParams,
  );
  await expectStatusCode(tokenRes, 200);
  return tokenRes.json();
}

describe("OAuth token lifecycle (revoke + introspect)", () => {
  let oldFeatureFlag: boolean;
  let previousResourceServers: string | undefined;

  beforeAll(async () => {
    setupTests();
    setupOAuthSigningKey();
    await db.initialize();
    oldFeatureFlag = setFeatureFlag(FeatureFlags.OAUTH_ENABLED, true);
    previousResourceServers = process.env.OAUTH_RESOURCE_SERVERS;
    process.env.OAUTH_RESOURCE_SERVERS = `${resourceServer.id}:${resourceServer.secret}`;

    await db.models.User.upsert({
      userId,
      name: "OAuth Lifecycle Tester",
      email: userEmail,
    });
    await OAuthClient.destroy({ where: { clientId: testClient.clientId } });
    await OAuthClient.create(testClient);

    const expires = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    jest.spyOn(Auth, "getServerSession").mockResolvedValue({
      user: { id: userId, name: "OAuth Lifecycle Tester", email: userEmail },
      csrfSecret,
      expires,
    } as unknown as AppSession);
  });

  afterAll(async () => {
    await RefreshToken.destroy({ where: { userId } });
    await AuthorizationCode.destroy({ where: { userId } });
    await OAuthClientAuthz.destroy({ where: { userId } });
    await OAuthClient.destroy({ where: { clientId: testClient.clientId } });
    await db.models.User.destroy({ where: { userId } });
    if (previousResourceServers === undefined) {
      delete process.env.OAUTH_RESOURCE_SERVERS;
    } else {
      process.env.OAUTH_RESOURCE_SERVERS = previousResourceServers;
    }
    setFeatureFlag(FeatureFlags.OAUTH_ENABLED, oldFeatureFlag);
    teardownTests();
    await db.sequelize?.close();
  });

  describe("POST /api/v1/oauth/revoke", () => {
    it("revokes a refresh token family", async () => {
      const tokens = await issueTokens();
      const revoke = await postRevoke(
        formRequest(
          {
            token: tokens.refresh_token,
            client_id: testClient.clientId,
          },
        ),
        noParams,
      );
      expect(revoke.status).toBe(200);

      // Refresh no longer works.
      await expectStatusCode(
        await postToken(
          formRequest({
            grant_type: "refresh_token",
            refresh_token: tokens.refresh_token,
            client_id: testClient.clientId,
          }),
          noParams,
        ),
        400,
      );
    });

    it("returns 200 for an unknown token", async () => {
      const res = await postRevoke(
        formRequest({
          token: "not-a-real-refresh-token",
          client_id: testClient.clientId,
        }),
        noParams,
      );
      expect(res.status).toBe(200);
    });
  });

  describe("POST /api/v1/oauth/introspect", () => {
    it("reports an active access token and an active refresh token", async () => {
      const tokens = await issueTokens();
      const auth = {
        authorization: basicAuth(resourceServer.id, resourceServer.secret),
      };

      const access = await postIntrospect(
        formRequest({ token: tokens.access_token }, auth),
        noParams,
      );
      await expectStatusCode(access, 200);
      expect(await access.json()).toMatchObject({
        active: true,
        client_id: testClient.clientId,
        sub: userId,
        token_type: "Bearer",
      });

      const refresh = await postIntrospect(
        formRequest({ token: tokens.refresh_token }, auth),
        noParams,
      );
      await expectStatusCode(refresh, 200);
      expect(await refresh.json()).toMatchObject({
        active: true,
        client_id: testClient.clientId,
        sub: userId,
      });
    });

    it("reports inactive for an expired refresh token", async () => {
      const tokens = await issueTokens();
      const hash = createHash("sha256")
        .update(tokens.refresh_token)
        .digest("hex");
      await RefreshToken.update(
        { expires: new Date(Date.now() - 1000) },
        { where: { tokenHash: hash } },
      );

      const res = await postIntrospect(
        formRequest(
          { token: tokens.refresh_token },
          {
            authorization: basicAuth(resourceServer.id, resourceServer.secret),
          },
        ),
        noParams,
      );
      await expectStatusCode(res, 200);
      expect(await res.json()).toEqual({ active: false });
    });

    it("reports inactive for a revoked refresh token", async () => {
      const tokens = await issueTokens();
      await postRevoke(
        formRequest({
          token: tokens.refresh_token,
          client_id: testClient.clientId,
        }),
        noParams,
      );

      const res = await postIntrospect(
        formRequest(
          { token: tokens.refresh_token },
          {
            authorization: basicAuth(resourceServer.id, resourceServer.secret),
          },
        ),
        noParams,
      );
      await expectStatusCode(res, 200);
      expect(await res.json()).toEqual({ active: false });
    });

    it("rejects a caller that is not a registered resource server", async () => {
      const tokens = await issueTokens();
      await expectStatusCode(
        await postIntrospect(
          formRequest(
            { token: tokens.access_token },
            { authorization: basicAuth("stranger", "nope") },
          ),
          noParams,
        ),
        401,
      );
    });
  });
});
