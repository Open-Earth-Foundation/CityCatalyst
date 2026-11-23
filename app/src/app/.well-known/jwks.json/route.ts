import { apiHandler } from "@/util/api";
import createHttpError from "http-errors";
import { NextResponse } from "next/server";
import { getPublicJwk } from "@/lib/auth/oauth-signing";
import { FeatureFlags, hasFeatureFlag } from "@/util/feature-flags";

/**
 * JSON Web Key Set (RFC 7517). Public, no authentication.
 *
 * Publishes the public half of the OAuth signing key, so relying parties and
 * resource servers can verify id_tokens and access tokens without any shared
 * secret. There is one key today. When keys are rotated, the retired key stays
 * in this list until the longest token signed with it has expired.
 */
export const GET = apiHandler(async () => {
  if (!hasFeatureFlag(FeatureFlags.OAUTH_ENABLED)) {
    throw createHttpError.NotFound("OAuth 2.0 not enabled on this server");
  }

  // Throws a 500 and logs why if OAUTH_SIGNING_KEY is missing or invalid.
  const jwk = getPublicJwk();

  return NextResponse.json(
    { keys: [jwk] },
    { headers: { "Cache-Control": "public, max-age=300" } },
  );
});
