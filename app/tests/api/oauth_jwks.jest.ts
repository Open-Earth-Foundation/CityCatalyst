/**
 * CC-1278: the API verifies OAuth access tokens with a published JWKS instead
 * of its own signing key, and checks issuer, audience and token type.
 *
 * A real HTTP server serves the key set, so fetching, caching, rotation and an
 * unreachable key server are exercised for real. The database is stubbed: the
 * user and the grant are looked up with spies.
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
import jwt from "jsonwebtoken";
import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";
import type { AddressInfo } from "node:net";
import { generateKeyPairSync, type KeyObject } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/models";
import { OAuthClientAuthz } from "@/models/OAuthClientAuthz";
import {
  OAuthTokenType,
  getOAuthSigningKey,
  signOAuthToken,
} from "@/lib/auth/oauth-signing";
import { clearJwksCache, verifyAccessTokenWith } from "@/lib/auth/oauth-verify";
import { apiHandler } from "@/util/api";
import { FeatureFlags, setFeatureFlag } from "@/util/feature-flags";
import { expectStatusCode, setupTests, teardownTests } from "../helpers";

const ORIGIN = "http://localhost:3000";
const USER_ID = "22222222-2222-4222-8222-222222222222";
const CLIENT_ID = "oauth-jwks-test-client";

interface TestKey {
  kid: string;
  privateKey: KeyObject;
  jwk: Record<string, unknown>;
}

function makeKey(kid: string): TestKey {
  const { privateKey, publicKey } = generateKeyPairSync("rsa", {
    modulusLength: 2048,
  });
  const jwk = { ...publicKey.export({ format: "jwk" }), kid, alg: "RS256" };
  return { kid, privateKey, jwk };
}

/** Serves `{ keys }` at /jwks.json and counts the requests it gets. */
class JwksServer {
  keys: TestKey[] = [];
  requests = 0;
  private server: Server | null = null;

  async start(): Promise<void> {
    this.server = createServer((_req: IncomingMessage, res: ServerResponse) => {
      this.requests++;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ keys: this.keys.map((key) => key.jwk) }));
    });
    await new Promise<void>((resolve) =>
      this.server!.listen(0, "127.0.0.1", resolve),
    );
  }

  get url(): string {
    const { port } = this.server!.address() as AddressInfo;
    return `http://127.0.0.1:${port}/jwks.json`;
  }

  async stop(): Promise<void> {
    if (!this.server) return;
    await new Promise<void>((resolve) => this.server!.close(() => resolve()));
    this.server = null;
  }
}

interface MintOptions {
  key: TestKey;
  typ?: string | null;
  issuer?: string;
  audience?: string;
  scope?: string;
  expiresIn?: number;
  /** An absolute expiry, in seconds since the epoch. Replaces `expiresIn`. */
  exp?: number;
}

/** Signs a token the way the token endpoint does, with knobs to break it. */
function mint(options: MintOptions): string {
  const { key } = options;
  const payload: Record<string, unknown> = {
    client_id: CLIENT_ID,
    scope: options.scope ?? "read write",
  };
  if (options.exp !== undefined) payload.exp = options.exp;
  const header: Record<string, unknown> = { alg: "RS256", kid: key.kid };
  if (options.typ !== null) header.typ = options.typ ?? OAuthTokenType.Access;
  return jwt.sign(payload, key.privateKey, {
    algorithm: "RS256",
    header: header as jwt.JwtHeader,
    issuer: options.issuer ?? ORIGIN,
    audience: options.audience ?? ORIGIN,
    subject: USER_ID,
    ...(options.exp === undefined
      ? { expiresIn: options.expiresIn ?? 900 }
      : {}),
  });
}

describe("Access tokens verified through a JWKS", () => {
  const server = new JwksServer();
  const keyA = makeKey("key-a");
  const keyB = makeKey("key-b");
  const saved: Record<string, string | undefined> = {};
  let oldFeatureFlag: boolean;
  let findGrant: ReturnType<typeof jest.spyOn>;
  let findUser: ReturnType<typeof jest.spyOn>;

  // A route that reports who the session belongs to and when it ends.
  const handler = apiHandler(async (_req, { session }) =>
    NextResponse.json({
      userId: session?.user.id ?? null,
      expires: session?.expires ?? null,
    }),
  );

  function call(token: string, method: "GET" | "POST" = "GET") {
    const req = new NextRequest(`${ORIGIN}/api/v1/oauth-jwks-test`, {
      method,
      headers: { Authorization: `Bearer ${token}` },
    });
    return handler(req, { params: Promise.resolve({}) });
  }

  beforeAll(async () => {
    setupTests();
    await db.initialize();
    oldFeatureFlag = setFeatureFlag(FeatureFlags.OAUTH_ENABLED, true);
    server.keys = [keyA];
    await server.start();
  });

  afterAll(async () => {
    await server.stop();
    setFeatureFlag(FeatureFlags.OAUTH_ENABLED, oldFeatureFlag);
    teardownTests();
    await db.sequelize?.close();
  });

  beforeEach(() => {
    for (const name of [
      "HOST",
      "OAUTH_SIGNING_KEY",
      "OAUTH_JWKS_URI",
      "OAUTH_ISSUER",
      "OAUTH_AUDIENCE",
    ]) {
      saved[name] = process.env[name];
    }
    process.env.HOST = ORIGIN;
    // Remote mode with no local signing key: the API must not need one.
    delete process.env.OAUTH_SIGNING_KEY;
    delete process.env.OAUTH_ISSUER;
    delete process.env.OAUTH_AUDIENCE;
    process.env.OAUTH_JWKS_URI = server.url;
    server.keys = [keyA];
    server.requests = 0;
    clearJwksCache();

    findGrant = jest
      .spyOn(OAuthClientAuthz, "findOne")
      .mockResolvedValue({ update: async () => undefined } as never);
    findUser = jest.spyOn(db.models.User, "findOne").mockResolvedValue({
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

  describe("with OAUTH_JWKS_URI set", () => {
    it("accepts a token signed by a published key, with no local signing key", async () => {
      const res = await call(mint({ key: keyA }));
      await expectStatusCode(res, 200);
      expect((await res.json()).userId).toBe(USER_ID);
      expect(server.requests).toBe(1);
    });

    it("ends the session when the token ends", async () => {
      const exp = Math.floor(Date.now() / 1000) + 600;
      const res = await call(mint({ key: keyA, exp }));
      await expectStatusCode(res, 200);
      expect((await res.json()).expires).toBe(
        new Date(exp * 1000).toISOString(),
      );
    });

    it("rejects an expired token", async () => {
      await expectStatusCode(
        await call(mint({ key: keyA, expiresIn: -60 })),
        401,
      );
    });

    it("rejects a token from another issuer", async () => {
      const token = mint({ key: keyA, issuer: "https://evil.example" });
      await expectStatusCode(await call(token), 401);
    });

    it("rejects a token meant for another audience", async () => {
      const token = mint({ key: keyA, audience: "https://other-api.example" });
      await expectStatusCode(await call(token), 401);
    });

    it.each([
      ["an opaque-style typ", "rt+jwt"],
      ["an id_token", OAuthTokenType.Id],
      ["a token with no type", null],
    ])("rejects %s used as an access token", async (_name, typ) => {
      await expectStatusCode(await call(mint({ key: keyA, typ })), 401);
    });

    it("rejects a token signed by a key that is not published", async () => {
      // keyB is real but not in the set, and its kid is unknown.
      await expectStatusCode(await call(mint({ key: keyB })), 401);
    });

    it("rejects a token that claims a published kid but is signed with another key", async () => {
      const impostor = { ...keyB, kid: keyA.kid };
      await expectStatusCode(await call(mint({ key: impostor })), 401);
    });

    it("rejects an unsigned token", async () => {
      const b64 = (value: object) =>
        Buffer.from(JSON.stringify(value)).toString("base64url");
      const token = `${b64({ alg: "none", typ: "at+jwt" })}.${b64({
        sub: USER_ID,
        iss: ORIGIN,
        aud: ORIGIN,
        scope: "read",
        client_id: CLIENT_ID,
        exp: Math.floor(Date.now() / 1000) + 600,
      })}.`;
      await expectStatusCode(await call(token), 401);
    });

    it("does not look up the grant or the user for a rejected token", async () => {
      await call(mint({ key: keyA, expiresIn: -60 }));
      expect(findGrant).not.toHaveBeenCalled();
      expect(findUser).not.toHaveBeenCalled();
    });

    it("answers 401 when the grant was revoked", async () => {
      findGrant.mockResolvedValue(null as never);
      await expectStatusCode(await call(mint({ key: keyA })), 401);
    });

    it("answers 401 when the user no longer exists", async () => {
      findUser.mockResolvedValue(null as never);
      await expectStatusCode(await call(mint({ key: keyA })), 401);
    });
  });

  describe("when the key server is unreachable", () => {
    it("answers 503 for a token it cannot check yet", async () => {
      // A port that nothing listens on.
      const closed = new JwksServer();
      await closed.start();
      const url = closed.url;
      await closed.stop();
      process.env.OAUTH_JWKS_URI = url;
      clearJwksCache();

      await expectStatusCode(await call(mint({ key: keyA })), 503);
    });

    it("keeps accepting tokens from cached keys while it is down", async () => {
      const own = new JwksServer();
      own.keys = [keyA];
      await own.start();
      process.env.OAUTH_JWKS_URI = own.url;
      clearJwksCache();

      await expectStatusCode(await call(mint({ key: keyA })), 200);
      await own.stop();
      await expectStatusCode(await call(mint({ key: keyA })), 200);
    });
  });

  describe("scope rule by HTTP method", () => {
    it("lets a read token read but not write", async () => {
      const token = mint({ key: keyA, scope: "read" });
      await expectStatusCode(await call(token, "GET"), 200);
      await expectStatusCode(await call(token, "POST"), 401);
    });

    it("lets a write token write but not read", async () => {
      const token = mint({ key: keyA, scope: "write" });
      await expectStatusCode(await call(token, "POST"), 200);
      await expectStatusCode(await call(token, "GET"), 401);
    });

    it("lets a read and write token do both", async () => {
      const token = mint({ key: keyA, scope: "read write" });
      await expectStatusCode(await call(token, "GET"), 200);
      await expectStatusCode(await call(token, "POST"), 200);
    });
  });

  describe("without OAUTH_JWKS_URI (the app is its own issuer)", () => {
    const AUDIENCE = "https://api.platform.example";
    const ISSUER = "https://id.platform.example";

    beforeEach(() => {
      delete process.env.OAUTH_JWKS_URI;
      const { privateKey } = generateKeyPairSync("rsa", {
        modulusLength: 2048,
      });
      process.env.OAUTH_SIGNING_KEY = privateKey
        .export({ type: "pkcs8", format: "pem" })
        .toString();
    });

    function local(options: { issuer?: string; audience?: string }) {
      return signOAuthToken(
        OAuthTokenType.Access,
        { client_id: CLIENT_ID, scope: "read write" },
        {
          expiresIn: 900,
          issuer: options.issuer ?? ORIGIN,
          audience: options.audience ?? ORIGIN,
          subject: USER_ID,
        },
      );
    }

    it("verifies with the local key and makes no request to a key server", async () => {
      await expectStatusCode(await call(local({})), 200);
      expect(server.requests).toBe(0);
    });

    it("uses HOST for issuer and audience when nothing else is configured", async () => {
      const wrongAudience = local({ audience: AUDIENCE });
      await expectStatusCode(await call(wrongAudience), 401);
    });

    it("requires the configured audience instead of the host", async () => {
      process.env.OAUTH_AUDIENCE = AUDIENCE;
      await expectStatusCode(await call(local({ audience: AUDIENCE })), 200);
      await expectStatusCode(await call(local({ audience: ORIGIN })), 401);
    });

    it("requires the configured issuer instead of the host", async () => {
      process.env.OAUTH_ISSUER = ISSUER;
      await expectStatusCode(await call(local({ issuer: ISSUER })), 200);
      await expectStatusCode(await call(local({ issuer: ORIGIN })), 401);
    });

    it("answers 401 for an OAuth token when no key is configured", async () => {
      const token = local({});
      delete process.env.OAUTH_SIGNING_KEY;
      await expectStatusCode(await call(token), 401);
    });

    it("answers 500 when the key is set but unusable", async () => {
      const token = local({});
      process.env.OAUTH_SIGNING_KEY = "not a key";
      await expectStatusCode(await call(token), 500);
    });
  });
});

describe("Key rotation (verifyAccessTokenWith)", () => {
  const server = new JwksServer();
  const keyA = makeKey("rotation-a");
  const keyB = makeKey("rotation-b");
  const base = { issuer: ORIGIN, audience: ORIGIN };

  beforeAll(async () => {
    // getOAuthSigningKey is not used in remote mode, but make sure of it.
    delete process.env.OAUTH_SIGNING_KEY;
    expect(() => getOAuthSigningKey()).toThrow();
    await server.start();
  });

  afterAll(async () => {
    await server.stop();
  });

  beforeEach(() => {
    server.keys = [keyA];
    server.requests = 0;
    clearJwksCache();
  });

  it("fetches a key it has not seen when a token names it", async () => {
    const check = { ...base, jwksUri: server.url, cooldownMs: 0 };
    await verifyAccessTokenWith(mint({ key: keyA }), check);
    expect(server.requests).toBe(1);

    // The issuer starts signing with a new key and publishes it.
    server.keys = [keyA, keyB];
    const payload = await verifyAccessTokenWith(mint({ key: keyB }), check);
    expect(payload.sub).toBe(USER_ID);
    expect(server.requests).toBe(2);
  });

  it("stops accepting a retired key once the cache has expired", async () => {
    server.keys = [keyA, keyB];
    const check = { ...base, jwksUri: server.url, cacheMaxAgeMs: 0 };
    await verifyAccessTokenWith(mint({ key: keyB }), check);

    server.keys = [keyA];
    await expect(
      verifyAccessTokenWith(mint({ key: keyB }), check),
    ).rejects.toMatchObject({ status: 401 });
  });

  it("does not refetch for every unknown key id", async () => {
    const check = { ...base, jwksUri: server.url, cooldownMs: 60_000 };
    await verifyAccessTokenWith(mint({ key: keyA }), check);
    expect(server.requests).toBe(1);

    // Tokens with made-up key ids must not turn into requests to the key server.
    for (let i = 0; i < 3; i++) {
      const bogus = makeKey(`made-up-${i}`);
      await expect(
        verifyAccessTokenWith(mint({ key: bogus }), check),
      ).rejects.toMatchObject({ status: 401 });
    }
    expect(server.requests).toBe(1);
  });
});
