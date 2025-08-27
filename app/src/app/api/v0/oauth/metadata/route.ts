import { apiHandler } from "@/util/api";
import createHttpError from "http-errors";
import { NextResponse } from "next/server";
import { languages } from "@/i18n/settings";
import { hasFeatureFlag, FeatureFlags } from "@/util/feature-flags";
import { logger } from "@/services/logger";

const DOCUMENTATION_URL = 'https://github.com/Open-Earth-Foundation/CityCatalyst/wiki/CityCatalyst-Backend-API'

// Definition of Authorization Server Metadata from
// https://datatracker.ietf.org/doc/html/rfc8414#section-2

interface OAuthMetadata {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  jwks_uri?: string;
  registration_endpoint?: string;
  scopes_supported: string[];
  response_types_supported: string[];
  response_modes_supported?: string[];
  grant_types_supported?: string[];
  token_endpoint_auth_methods_supported?: string[];
  token_endpoint_auth_signing_alg_values_supported?: string[];
  service_documentation?: string;
  ui_locales_supported?: string[];
  op_policy_uri?: string;
  op_tos_uri?: string;
  revocation_endpoint?: string;
  revocation_endpoint_auth_methods_supported?: string[];
  revocation_endpoint_auth_signing_alg_values_supported?: string[];
  introspection_endpoint?: string;
  introspection_endpoint_auth_methods_supported?: string[];
  introspection_endpoint_auth_signing_alg_values_supported?: string[];
  code_challenge_methods_supported?: string[];
}

export const GET = apiHandler(async (_req) => {
  if (!hasFeatureFlag(FeatureFlags.OAUTH_ENABLED)) {
    logger.warn(
      `OAuth Metadata endpoint hit but OAuth 2.0 is not enabled.
       Check the OAUTH_ENABLED feature flag.`
    );
    throw createHttpError.InternalServerError(
      "OAuth 2.0 not enabled on this server"
    );
  }

  const origin = _req.nextUrl.origin;

  if (!origin) {
    throw createHttpError.InternalServerError('Unable to determine server origin URL');
  }

  return NextResponse.json<OAuthMetadata>({
    issuer: `${origin}/`,
    authorization_endpoint: `${origin}/authorize/`,
    token_endpoint: `${origin}/api/v0/token/`,
    scopes_supported: ['read', 'write'],
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    service_documentation: DOCUMENTATION_URL,
    ui_locales_supported: languages,
    code_challenge_methods_supported: ['S256']
  })
})