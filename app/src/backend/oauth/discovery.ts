import { languages } from "@/i18n/settings";

const DOCUMENTATION_URL =
  "https://github.com/Open-Earth-Foundation/CityCatalyst/wiki/CityCatalyst-Backend-API";

/**
 * The deprecated path /api/v1/oauth/metadata stays until this date. It is part
 * of the frozen public API contract (platform-contracts), whose policy requires
 * a deprecation window of at least 6 months before an endpoint may be removed.
 * The window starts from the contract release that marks it deprecated, so
 * check this date against that release before it is published.
 */
export const LEGACY_METADATA_SUNSET = "2027-09-30";

/** The day the path was marked deprecated. */
export const LEGACY_METADATA_DEPRECATED = "2026-11-18";

/**
 * Response headers for the deprecated /api/v1/oauth/metadata path.
 * `Deprecation` is RFC 9745 (a date in seconds since the epoch), `Sunset` is
 * RFC 8594 (an HTTP date), and `Link` points to the replacement.
 */
export function legacyMetadataHeaders(issuer: string): Record<string, string> {
  const deprecatedAt = Math.floor(
    Date.parse(LEGACY_METADATA_DEPRECATED) / 1000,
  );
  return {
    Deprecation: `@${deprecatedAt}`,
    Sunset: new Date(`${LEGACY_METADATA_SUNSET}T00:00:00Z`).toUTCString(),
    Link: `<${issuer}/.well-known/openid-configuration>; rel="successor-version"`,
  };
}

/** The issuer. It is the `iss` of every token and must match the discovery document. */
export function issuerFor(req: Request): string {
  return process.env.HOST || new URL(req.url).origin;
}

/**
 * OpenID Connect Discovery 1.0 document, also valid as RFC 8414 authorization
 * server metadata. Served at /.well-known/openid-configuration and at
 * /.well-known/oauth-authorization-server.
 *
 * Endpoint URLs end in a slash because `trailingSlash` is on in next.config.mjs.
 * Advertising the final URL spares clients a redirect.
 */
export function buildDiscoveryDocument(issuer: string) {
  return {
    issuer,
    authorization_endpoint: `${issuer}/authorize/`,
    token_endpoint: `${issuer}/api/v1/token/`,
    userinfo_endpoint: `${issuer}/api/v1/oauth/userinfo/`,
    jwks_uri: `${issuer}/.well-known/jwks.json/`,
    scopes_supported: ["openid", "read", "write"],
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    subject_types_supported: ["public"],
    id_token_signing_alg_values_supported: ["RS256"],
    // Public clients only, protected by PKCE. There are no client secrets yet.
    token_endpoint_auth_methods_supported: ["none"],
    code_challenge_methods_supported: ["S256"],
    claims_supported: [
      "sub",
      "iss",
      "aud",
      "exp",
      "iat",
      "nonce",
      "amr",
      "email",
      "name",
      "org_ids",
    ],
    service_documentation: DOCUMENTATION_URL,
    ui_locales_supported: languages,
  };
}
