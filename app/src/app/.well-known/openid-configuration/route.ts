import { apiHandler } from "@/util/api";
import createHttpError from "http-errors";
import { NextResponse } from "next/server";
import { buildDiscoveryDocument, issuerFor } from "@/backend/oauth/discovery";
import { FeatureFlags, hasFeatureFlag } from "@/util/feature-flags";

/**
 * OpenID Connect Discovery 1.0. Public, no authentication.
 *
 * Also served at /.well-known/oauth-authorization-server (RFC 8414) through a
 * rewrite in next.config.mjs, which is the address MCP clients look up. This
 * route is outside /api/v1, so it is not part of the frozen API contract and
 * is not in the generated OpenAPI document.
 */
export const GET = apiHandler(async (req) => {
  if (!hasFeatureFlag(FeatureFlags.OAUTH_ENABLED)) {
    throw createHttpError.NotFound("OAuth 2.0 not enabled on this server");
  }

  return NextResponse.json(buildDiscoveryDocument(issuerFor(req)), {
    // The document only changes with a deployment, so a short cache is safe.
    headers: { "Cache-Control": "public, max-age=300" },
  });
});
