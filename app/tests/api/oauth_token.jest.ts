import { POST as postToken } from "@/app/api/v1/token/route";
import { db } from "@/models";
import { OAuthClient } from "@/models/OAuthClient";
import { UsedAuthorizationCode } from "@/models/UsedAuthorizationCode";
import { FeatureFlags, setFeatureFlag } from "@/util/feature-flags";
import { afterAll, beforeAll, describe, expect, it } from "@jest/globals";
import jwt from "jsonwebtoken";
import { createHash, randomBytes } from "node:crypto";
import { v4 } from "uuid";
import {
  expectStatusCode,
  mockRequestFormData,
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

function createCode(jwtid: string): string {
  const origin = process.env.HOST || "http://localhost:3000";
  return jwt.sign(
    {
      client_id: testClient.clientId,
      redirect_uri: testClient.redirectURI,
      scope: "read",
      code_challenge: codeChallenge,
    },
    process.env.VERIFICATION_TOKEN_SECRET!,
    {
      expiresIn: "5m",
      issuer: origin,
      audience: origin,
      subject: testUserID,
      jwtid,
    },
  );
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
});
