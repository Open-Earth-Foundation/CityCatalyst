import { GET as getMetadata } from "@/app/api/v1/oauth/metadata/route";
import { GET as getDiscovery } from "@/app/.well-known/openid-configuration/route";
import { GET as getJwks } from "@/app/.well-known/jwks.json/route";
import { db } from "@/models";
import { afterAll, beforeAll, describe, expect, it } from "@jest/globals";
import jwt from "jsonwebtoken";
import { createPublicKey } from "node:crypto";
import {
  expectStatusCode,
  mockRequest,
  setupOAuthSigningKey,
  setupTests,
  teardownTests,
} from "../helpers";
import { setFeatureFlag, FeatureFlags } from "@/util/feature-flags";
import { OAuthTokenType, signOAuthToken } from "@/lib/auth/oauth-signing";
import {
  LEGACY_METADATA_SUNSET,
  buildDiscoveryDocument,
} from "@/backend/oauth/discovery";

const URL_REGEX =
  /^https?:\/\/(?:(?:[a-z0-9-]+\.)+[a-z]{2,}|localhost|\d{1,3}(?:\.\d{1,3}){3})(?::\d{2,5})?(?:\/\S*)?$/;

const noParams = { params: Promise.resolve({}) };

describe("OpenID Connect discovery and JWKS", () => {
  let oldFeatureFlag: boolean;
  beforeAll(async () => {
    setupTests();
    setupOAuthSigningKey();
    await db.initialize();
    oldFeatureFlag = setFeatureFlag(FeatureFlags.OAUTH_ENABLED, true);
  });

  afterAll(async () => {
    setFeatureFlag(FeatureFlags.OAUTH_ENABLED, oldFeatureFlag);
    teardownTests();
    await db.sequelize?.close();
  });

  describe("GET /.well-known/openid-configuration", () => {
    let metadata: Record<string, any>;

    it("should return a JSON object that can be cached briefly", async () => {
      const res = await getDiscovery(mockRequest(), noParams);
      await expectStatusCode(res, 200);
      expect(res.headers.get("Content-Type")).toEqual("application/json");
      expect(res.headers.get("Cache-Control")).toContain("max-age=300");
      expect(res.headers.get("Deprecation")).toBeNull();
      metadata = await res.json();
      expect(typeof metadata).toBe("object");
    });

    it("should have URLs for the issuer and all endpoints", () => {
      for (const key of [
        "issuer",
        "authorization_endpoint",
        "token_endpoint",
        "userinfo_endpoint",
        "jwks_uri",
        "service_documentation",
      ]) {
        expect(typeof metadata[key]).toBe("string");
        expect(metadata[key]).toMatch(URL_REGEX);
      }
      expect(metadata.token_endpoint).toBe(`${metadata.issuer}/api/v1/token/`);
      expect(metadata.jwks_uri).toBe(
        `${metadata.issuer}/.well-known/jwks.json/`,
      );
    });

    it("should advertise the openid scope and RS256 id_tokens", () => {
      expect(metadata.scopes_supported).toEqual(["openid", "read", "write"]);
      expect(metadata.id_token_signing_alg_values_supported).toEqual(["RS256"]);
      expect(metadata.subject_types_supported).toEqual(["public"]);
    });

    it("should support the code flow with PKCE S256 for public clients", () => {
      expect(metadata.response_types_supported).toContain("code");
      expect(metadata.grant_types_supported).toContain("authorization_code");
      expect(metadata.grant_types_supported).toContain("refresh_token");
      expect(metadata.code_challenge_methods_supported).toContain("S256");
      expect(metadata.token_endpoint_auth_methods_supported).toEqual(["none"]);
    });

    it("should list the claims it can return", () => {
      for (const claim of ["sub", "email", "name", "org_ids", "nonce", "amr"]) {
        expect(metadata.claims_supported).toContain(claim);
      }
      expect(metadata.claims_supported).not.toContain("email_verified");
    });

    it("should list the supported UI locales", () => {
      for (const lng of ["de", "en", "es", "fr", "pt"]) {
        expect(metadata.ui_locales_supported).toContain(lng);
      }
    });

    it("returns 404 when OAuth is not enabled", async () => {
      setFeatureFlag(FeatureFlags.OAUTH_ENABLED, false);
      try {
        await expectStatusCode(
          await getDiscovery(mockRequest(), noParams),
          404,
        );
      } finally {
        setFeatureFlag(FeatureFlags.OAUTH_ENABLED, true);
      }
    });
  });

  describe("GET /api/v1/oauth/metadata (deprecated)", () => {
    it("serves the same document as the new path", async () => {
      const oldRes = await getMetadata(mockRequest(), noParams);
      await expectStatusCode(oldRes, 200);
      const newRes = await getDiscovery(mockRequest(), noParams);
      expect(await oldRes.json()).toEqual(await newRes.json());
    });

    it("announces deprecation, the sunset date and the successor", async () => {
      const res = await getMetadata(mockRequest(), noParams);
      const deprecation = res.headers.get("Deprecation");
      expect(deprecation).toMatch(/^@\d+$/);
      expect(new Date(res.headers.get("Sunset")!).toISOString()).toBe(
        `${LEGACY_METADATA_SUNSET}T00:00:00.000Z`,
      );
      const link = res.headers.get("Link")!;
      expect(link).toContain("/.well-known/openid-configuration");
      expect(link).toContain('rel="successor-version"');
    });

    it("still returns 500 when OAuth is not enabled", async () => {
      setFeatureFlag(FeatureFlags.OAUTH_ENABLED, false);
      try {
        await expectStatusCode(await getMetadata(mockRequest(), noParams), 500);
      } finally {
        setFeatureFlag(FeatureFlags.OAUTH_ENABLED, true);
      }
    });
  });

  describe("buildDiscoveryDocument", () => {
    it("builds every URL from the issuer it is given", () => {
      const doc = buildDiscoveryDocument("https://cc.example");
      expect(doc.issuer).toBe("https://cc.example");
      expect(doc.authorization_endpoint).toBe("https://cc.example/authorize/");
      expect(doc.userinfo_endpoint).toBe(
        "https://cc.example/api/v1/oauth/userinfo/",
      );
    });
  });

  describe("GET /.well-known/jwks.json", () => {
    it("publishes a public key that verifies tokens we sign", async () => {
      const res = await getJwks(mockRequest(), noParams);
      await expectStatusCode(res, 200);
      const { keys } = await res.json();
      expect(keys).toHaveLength(1);
      const [jwk] = keys;

      // Only public members, never the private exponent.
      expect(jwk.kty).toBe("RSA");
      expect(jwk.alg).toBe("RS256");
      expect(jwk.use).toBe("sig");
      expect(jwk.kid).toBeTruthy();
      for (const secret of ["d", "p", "q", "dp", "dq", "qi"]) {
        expect(jwk[secret]).toBeUndefined();
      }

      // A relying party holds nothing but this JWK.
      const token = signOAuthToken(
        OAuthTokenType.Id,
        { hello: "world" },
        { expiresIn: 60 },
      );
      expect(jwt.decode(token, { complete: true })!.header.kid).toBe(jwk.kid);
      const publicKey = createPublicKey({ key: jwk, format: "jwk" });
      const payload = jwt.verify(token, publicKey, {
        algorithms: ["RS256"],
      }) as jwt.JwtPayload;
      expect(payload.hello).toBe("world");
    });

    it("returns 404 when OAuth is not enabled", async () => {
      setFeatureFlag(FeatureFlags.OAUTH_ENABLED, false);
      try {
        await expectStatusCode(await getJwks(mockRequest(), noParams), 404);
      } finally {
        setFeatureFlag(FeatureFlags.OAUTH_ENABLED, true);
      }
    });
  });
});
