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
import jwt from "jsonwebtoken";
import {
  createHmac,
  createPublicKey,
  generateKeyPairSync,
  type KeyObject,
} from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import {
  OAUTH_SIGNING_ALGORITHM,
  OAuthTokenType,
  getOAuthSigningKey,
  signOAuthToken,
  verifyOAuthToken,
} from "@/lib/auth/oauth-signing";
import { db } from "@/models";

import { OAuthClientAuthz } from "@/models/OAuthClientAuthz";
import { apiHandler } from "@/util/api";
import { FeatureFlags, setFeatureFlag } from "@/util/feature-flags";
import { expectStatusCode, setupTests } from "../helpers";

const ORIGIN = "http://localhost:3000";
const USER_ID = "11111111-1111-4111-8111-111111111111";
const CLIENT_ID = "oauth-signing-test-client";
const SHARED_SECRET = "test-shared-secret";
const SERVICE_KEY = "test-service-key";

function rsaKey(bits = 2048) {
  return generateKeyPairSync("rsa", { modulusLength: bits }).privateKey;
}
function toPem(key: KeyObject): string {
  return key.export({ type: "pkcs8", format: "pem" }).toString();
}

const primaryKey = rsaKey();
const otherKey = rsaKey();

/** The status of the HTTP error thrown by fn, or undefined if it did not throw. */
function errorStatus(fn: () => unknown): number | undefined {
  try {
    fn();
  } catch (error) {
    return (error as { status?: number }).status;
  }
  return undefined;
}

describe("OAuth signing key", () => {
  const originalKey = process.env.OAUTH_SIGNING_KEY;

  afterEach(() => {
    // Assigning undefined would store the text "undefined", not remove it.
    if (originalKey === undefined) delete process.env.OAUTH_SIGNING_KEY;
    else process.env.OAUTH_SIGNING_KEY = originalKey;
  });

  it("fails with a 500 when the key is missing", () => {
    delete process.env.OAUTH_SIGNING_KEY;
    expect(errorStatus(() => getOAuthSigningKey())).toBe(500);
    expect(errorStatus(() => signOAuthToken(OAuthTokenType.Access, {}))).toBe(
      500,
    );
  });

  it.each([
    ["is not a PEM", "not a key"],
    [
      "is an EC key",
      toPem(generateKeyPairSync("ec", { namedCurve: "P-256" }).privateKey),
    ],
    ["is shorter than 2048 bits", toPem(rsaKey(1024))],
  ])("fails with a 500 when the key %s", (_name, value) => {
    process.env.OAUTH_SIGNING_KEY = value;
    expect(errorStatus(() => getOAuthSigningKey())).toBe(500);
  });

  it("accepts a key written on one line with escaped line breaks", () => {
    const pem = toPem(primaryKey);
    process.env.OAUTH_SIGNING_KEY = pem.trim().replace(/\n/g, "\\n");
    const token = signOAuthToken(OAuthTokenType.Access, { hello: "world" });

    process.env.OAUTH_SIGNING_KEY = pem;
    expect(verifyOAuthToken(token, OAuthTokenType.Access).hello).toBe("world");
  });

  it("derives a stable key id that changes with the key", () => {
    process.env.OAUTH_SIGNING_KEY = toPem(primaryKey);
    const first = getOAuthSigningKey().kid;
    expect(first).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(getOAuthSigningKey().kid).toBe(first);

    process.env.OAUTH_SIGNING_KEY = toPem(otherKey);
    expect(getOAuthSigningKey().kid).not.toBe(first);
  });

  it("signs with RS256 and the key id, and verifies with the same key", () => {
    process.env.OAUTH_SIGNING_KEY = toPem(primaryKey);
    const token = signOAuthToken(
      OAuthTokenType.Access,
      { sub: USER_ID },
      { expiresIn: "5m" },
    );

    const decoded = jwt.decode(token, { complete: true });
    expect(decoded?.header.alg).toBe(OAUTH_SIGNING_ALGORITHM);
    expect(decoded?.header.kid).toBe(getOAuthSigningKey().kid);
    expect(decoded?.header.typ).toBe("at+jwt");
    expect(verifyOAuthToken(token, OAuthTokenType.Access).sub).toBe(USER_ID);
  });

  it.each([
    [OAuthTokenType.Id, OAuthTokenType.Refresh],
    [OAuthTokenType.Id, OAuthTokenType.Access],
    [OAuthTokenType.Access, OAuthTokenType.Refresh],
    [OAuthTokenType.Refresh, OAuthTokenType.Access],
  ])("does not verify a %s token as %s", (issued, expected) => {
    process.env.OAUTH_SIGNING_KEY = toPem(primaryKey);
    const token = signOAuthToken(issued, { sub: USER_ID });
    expect(() => verifyOAuthToken(token, expected)).toThrow(
      jwt.JsonWebTokenError,
    );
    // The right type still works.
    expect(verifyOAuthToken(token, issued).sub).toBe(USER_ID);
  });

  it("does not verify a token that carries no type", () => {
    process.env.OAUTH_SIGNING_KEY = toPem(primaryKey);
    const untyped = jwt.sign({ sub: USER_ID }, primaryKey, {
      algorithm: "RS256",
    });
    expect(() => verifyOAuthToken(untyped, OAuthTokenType.Access)).toThrow(
      jwt.JsonWebTokenError,
    );
  });

  it("rejects tokens signed with another key, expired tokens and tampered tokens", () => {
    process.env.OAUTH_SIGNING_KEY = toPem(primaryKey);

    const foreign = jwt.sign({ sub: USER_ID }, otherKey, {
      algorithm: "RS256",
    });
    expect(() => verifyOAuthToken(foreign, OAuthTokenType.Access)).toThrow();

    const expired = signOAuthToken(
      OAuthTokenType.Access,
      { sub: USER_ID },
      { expiresIn: -10 },
    );
    expect(() => verifyOAuthToken(expired, OAuthTokenType.Access)).toThrow(
      jwt.TokenExpiredError,
    );

    const [head, , sig] = signOAuthToken(OAuthTokenType.Access, {
      sub: USER_ID,
    }).split(".");
    const forgedBody = Buffer.from(
      JSON.stringify({ sub: "someone-else" }),
    ).toString("base64url");
    expect(() =>
      verifyOAuthToken(`${head}.${forgedBody}.${sig}`, OAuthTokenType.Access),
    ).toThrow();
  });
});

describe("Bearer tokens in apiHandler", () => {
  const saved: Record<string, string | undefined> = {};
  let oldFeatureFlag: boolean;

  // A route that only reports who the session belongs to.
  const GET = apiHandler(async (_req, { session }) =>
    NextResponse.json({ userId: session?.user.id ?? null }),
  );

  async function call(token: string, headers: Record<string, string> = {}) {
    const req = new NextRequest(`${ORIGIN}/api/v1/oauth-signing-test`, {
      headers: { Authorization: `Bearer ${token}`, ...headers },
    });
    return GET(req, { params: Promise.resolve({}) });
  }

  const serviceHeaders = {
    "X-Service-Name": "climate-advisor",
    "X-Service-Key": SERVICE_KEY,
  };

  /** A token with the claims of a real OAuth access token. */
  const accessClaims = { client_id: CLIENT_ID, scope: "read write" };
  const accessOptions = {
    issuer: ORIGIN,
    audience: ORIGIN,
    subject: USER_ID,
    expiresIn: "15m" as const,
  };

  /** A Climate Advisor user token, signed with the shared secret. */
  function climateAdvisorToken(): string {
    return jwt.sign(
      { sub: USER_ID, role: "user", issued_by: "climate-advisor-service" },
      SHARED_SECRET,
      {
        algorithm: "HS256",
        issuer: "climate-advisor-service",
        audience: ORIGIN,
        expiresIn: "1h",
      },
    );
  }

  // The grant lookup runs only after a token has passed verification, so a
  // rejected token must never reach it.
  let findGrant: ReturnType<typeof jest.spyOn>;

  beforeAll(async () => {
    setupTests();
    await db.initialize();
    oldFeatureFlag = setFeatureFlag(FeatureFlags.OAUTH_ENABLED, true);
  });

  afterAll(async () => {
    setFeatureFlag(FeatureFlags.OAUTH_ENABLED, oldFeatureFlag);
    await db.sequelize?.close();
  });

  beforeEach(() => {
    for (const name of [
      "OAUTH_SIGNING_KEY",
      "VERIFICATION_TOKEN_SECRET",
      "CC_SERVICE_API_KEY",
      "HOST",
    ]) {
      saved[name] = process.env[name];
    }
    process.env.OAUTH_SIGNING_KEY = toPem(primaryKey);
    process.env.VERIFICATION_TOKEN_SECRET = SHARED_SECRET;
    process.env.CC_SERVICE_API_KEY = SERVICE_KEY;
    process.env.HOST = ORIGIN;

    // No database: the grant and the user are stubbed.
    findGrant = jest
      .spyOn(OAuthClientAuthz, "findOne")
      .mockResolvedValue({ update: async () => undefined } as never);
    jest.spyOn(db.models.User, "findOne").mockResolvedValue({
      userId: USER_ID,
      name: "Test User",
      email: "test@example.org",
      pictureUrl: null,
      role: "user",
    } as never);
  });

  afterEach(() => {
    jest.restoreAllMocks();
    for (const [name, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  });

  it("accepts an access token signed with the OAuth key", async () => {
    const res = await call(
      signOAuthToken(OAuthTokenType.Access, accessClaims, accessOptions),
    );
    await expectStatusCode(res, 200);
    expect((await res.json()).userId).toBe(USER_ID);
  });

  it.each([OAuthTokenType.Refresh, OAuthTokenType.Id])(
    "rejects a %s token used as a bearer token",
    async (type) => {
      // Same key, same claims, same audience: only the type differs.
      const token = signOAuthToken(type, accessClaims, accessOptions);
      await expectStatusCode(await call(token), 401);
      expect(findGrant).not.toHaveBeenCalled();
    },
  );

  it("rejects an HS256 token with OAuth-shaped claims signed with the shared secret", async () => {
    // Before the key split this was a valid access token.
    const token = jwt.sign(accessClaims, SHARED_SECRET, {
      ...accessOptions,
      algorithm: "HS256",
    });
    const res = await call(token);
    await expectStatusCode(res, 401);
    expect(findGrant).not.toHaveBeenCalled();
  });

  it("rejects an invite-style token signed with the shared secret", async () => {
    const token = jwt.sign(
      { email: "invitee@example.org", reason: "invite", aud: ORIGIN },
      SHARED_SECRET,
      { algorithm: "HS256", expiresIn: "30d" },
    );
    await expectStatusCode(await call(token), 401);
  });

  it("rejects a token signed with a different RSA key", async () => {
    const token = jwt.sign(accessClaims, otherKey, {
      ...accessOptions,
      algorithm: "RS256",
    });
    await expectStatusCode(await call(token), 401);
  });

  it("rejects an unsigned token with alg none", async () => {
    const b64 = (value: object) =>
      Buffer.from(JSON.stringify(value)).toString("base64url");
    const token = `${b64({ alg: "none", typ: "JWT" })}.${b64({
      ...accessClaims,
      sub: USER_ID,
      aud: ORIGIN,
    })}.`;
    await expectStatusCode(await call(token), 401);
  });

  it("rejects an RS256 token whose signature is an HMAC made with the public key", async () => {
    // The classic algorithm confusion attack: the attacker knows the public key.
    const publicPem = createPublicKey(primaryKey)
      .export({ type: "spki", format: "pem" })
      .toString();
    const b64 = (value: object) =>
      Buffer.from(JSON.stringify(value)).toString("base64url");
    const head = b64({ alg: "RS256", typ: "JWT" });
    const body = b64({
      ...accessClaims,
      sub: USER_ID,
      iss: ORIGIN,
      aud: ORIGIN,
      exp: Math.floor(Date.now() / 1000) + 600,
    });
    const sig = createHmac("sha256", publicPem)
      .update(`${head}.${body}`)
      .digest("base64url");
    await expectStatusCode(await call(`${head}.${body}.${sig}`), 401);
  });

  it("rejects an OAuth token on the service-to-service path", async () => {
    const token = signOAuthToken(
      OAuthTokenType.Access,
      { sub: USER_ID, issued_by: "climate-advisor-service" },
      {
        issuer: "climate-advisor-service",
        audience: ORIGIN,
        expiresIn: "1h",
      },
    );
    await expectStatusCode(await call(token, serviceHeaders), 401);
  });

  it("still accepts a Climate Advisor token signed with the shared secret", async () => {
    const res = await call(climateAdvisorToken(), serviceHeaders);
    await expectStatusCode(res, 200);
    expect((await res.json()).userId).toBe(USER_ID);
  });

  it("does not accept a Climate Advisor token as an OAuth access token", async () => {
    // No service headers, so this goes down the OAuth path.
    await expectStatusCode(await call(climateAdvisorToken()), 401);
  });

  it("answers 401, not 500, for an RS256 token when no OAuth key is configured", async () => {
    const token = signOAuthToken(
      OAuthTokenType.Access,
      accessClaims,
      accessOptions,
    );
    delete process.env.OAUTH_SIGNING_KEY;
    await expectStatusCode(await call(token), 401);
  });

  it("answers 500 when the OAuth key is set but unusable", async () => {
    const token = signOAuthToken(
      OAuthTokenType.Access,
      accessClaims,
      accessOptions,
    );
    process.env.OAUTH_SIGNING_KEY = "not a key";
    await expectStatusCode(await call(token), 500);
  });
});
