/**
 * @swagger
 * /api/v1/oauth/metadata:
 *   get:
 *     tags:
 *       - oauth
 *     operationId: getOauthMetadata
 *     deprecated: true
 *     x-sunset: "2027-09-30"
 *     summary: Advertise OAuth 2.0 Authorization Server metadata (RFC 8414). Deprecated, use /.well-known/openid-configuration.
 *     description: |
 *       Deprecated. Use `/.well-known/openid-configuration` (OpenID Connect Discovery) or `/.well-known/oauth-authorization-server` (RFC 8414). They return the same document. This path stays until the sunset date, `2027-09-30`, because it is part of the frozen API contract. Responses carry `Deprecation` and `Sunset` headers.
 *
 *       Public endpoint that returns the discovery document for OAuth clients, including issuer, authorization endpoint, token endpoint, userinfo endpoint, JWKS location, supported scopes, response types, grant types, and PKCE methods. Requires the OAUTH_ENABLED feature flag; otherwise returns a 500 configuration error.
 *     responses:
 *       200:
 *         description: Metadata document with required fields.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 issuer:
 *                   type: string
 *                 authorization_endpoint:
 *                   type: string
 *                 token_endpoint:
 *                   type: string
 *                 userinfo_endpoint:
 *                   type: string
 *                   description: OpenID Connect UserInfo endpoint
 *                 jwks_uri:
 *                   type: string
 *                   description: Where the public keys that verify tokens are published
 *                 scopes_supported:
 *                   type: array
 *                   items:
 *                     type: string
 *                     description: OAuth scope identifiers supported by the authorization server
 *                     example: "read"
 *                   description: List of OAuth 2.0 scopes supported by the authorization server
 *                 response_types_supported:
 *                   type: array
 *                   items:
 *                     type: string
 *                     description: OAuth response type identifier
 *                     example: "code"
 *                   description: OAuth 2.0 response types supported by the authorization server
 *                 grant_types_supported:
 *                   type: array
 *                   items:
 *                     type: string
 *                     description: OAuth grant type identifier
 *                     example: "authorization_code"
 *                   description: OAuth 2.0 grant types supported by the authorization server
 *                 subject_types_supported:
 *                   type: array
 *                   items:
 *                     type: string
 *                     example: "public"
 *                 id_token_signing_alg_values_supported:
 *                   type: array
 *                   items:
 *                     type: string
 *                     example: "RS256"
 *                 token_endpoint_auth_methods_supported:
 *                   type: array
 *                   items:
 *                     type: string
 *                     example: "none"
 *                 claims_supported:
 *                   type: array
 *                   items:
 *                     type: string
 *                 service_documentation:
 *                   type: string
 *                   description: URL to the authorization server's documentation
 *                   example: "https://github.com/Open-Earth-Foundation/CityCatalyst/wiki/CityCatalyst-Backend-API"
 *                 ui_locales_supported:
 *                   type: array
 *                   items:
 *                     type: string
 *                     description: Language tag for supported UI locales
 *                     example: "en"
 *                   description: Languages supported for the user interface
 *                 code_challenge_methods_supported:
 *                   type: array
 *                   items:
 *                     type: string
 *                     description: PKCE code challenge method
 *                     example: "S256"
 *                   description: PKCE code challenge methods supported by the authorization server
 *             examples:
 *               example:
 *                 value:
 *                   issuer: "https://api.citycatalyst.example"
 *                   authorization_endpoint: "https://api.citycatalyst.example/authorize/"
 *                   token_endpoint: "https://api.citycatalyst.example/api/v1/token/"
 *                   userinfo_endpoint: "https://api.citycatalyst.example/api/v1/oauth/userinfo/"
 *                   jwks_uri: "https://api.citycatalyst.example/.well-known/jwks.json/"
 *                   scopes_supported: ["openid", "read", "write"]
 *                   response_types_supported: ["code"]
 *                   grant_types_supported: ["authorization_code", "refresh_token"]
 *                   subject_types_supported: ["public"]
 *                   id_token_signing_alg_values_supported: ["RS256"]
 *                   token_endpoint_auth_methods_supported: ["none"]
 *                   service_documentation: "https://github.com/Open-Earth-Foundation/CityCatalyst/wiki/CityCatalyst-Backend-API"
 *                   ui_locales_supported: ["en", "de", "es", "pt"]
 *                   code_challenge_methods_supported: ["S256"]
 *       500:
 *         description: OAuth not enabled or configuration error.
 */
import { apiHandler } from "@/util/api";
import createHttpError from "http-errors";
import { NextResponse } from "next/server";
import {
  buildDiscoveryDocument,
  issuerFor,
  legacyMetadataHeaders,
} from "@/backend/oauth/discovery";
import { hasFeatureFlag, FeatureFlags } from "@/util/feature-flags";
import { logger } from "@/services/logger";

/**
 * Deprecated path for the discovery document. It serves the same document as
 * /.well-known/openid-configuration. It is kept, not removed, because paths
 * under /api/v1 are part of the frozen API contract and may only be removed
 * after a deprecation window (see LEGACY_METADATA_SUNSET).
 */
export const GET = apiHandler(async (req) => {
  if (!hasFeatureFlag(FeatureFlags.OAUTH_ENABLED)) {
    logger.warn(
      `OAuth Metadata endpoint hit but OAuth 2.0 is not enabled.
       Check the OAUTH_ENABLED feature flag.`,
    );
    throw createHttpError.InternalServerError(
      "OAuth 2.0 not enabled on this server",
    );
  }

  const issuer = issuerFor(req);

  if (!issuer) {
    throw createHttpError.InternalServerError(
      "Unable to determine server origin URL",
    );
  }

  return NextResponse.json(buildDiscoveryDocument(issuer), {
    headers: legacyMetadataHeaders(issuer),
  });
});
