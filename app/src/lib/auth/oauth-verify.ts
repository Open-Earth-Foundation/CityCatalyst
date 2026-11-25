/**
 * Verifies OAuth access tokens on the API side (the resource server).
 *
 * Checks the signature, the algorithm (RS256 only), the token type (`at+jwt`),
 * the issuer, the audience, and that the token has not expired. It needs no
 * database. Whether the user still exists, still has the grant, and what role
 * they have are separate questions, answered by the caller.
 *
 * Where the verification key comes from depends on configuration
 * (see oauth-config.ts):
 * - no `OAUTH_JWKS_URI`: the public half of this app's own signing key. No HTTP
 *   request is made. This is right while this app is also the issuer.
 * - `OAUTH_JWKS_URI` set: the keys published at that URL. They are cached, and
 *   a token with an unknown `kid` makes one refetch, so key rotation needs no
 *   restart. A retired key stops verifying once it leaves the published set and
 *   the cache expires.
 */
import createHttpError from "http-errors";
import { createRemoteJWKSet, errors, jwtVerify, type JWTPayload } from "jose";
import { logger } from "@/services/logger";
import {
  getOAuthAudience,
  getOAuthIssuer,
  getOAuthJwksUri,
} from "./oauth-config";
import {
  OAUTH_SIGNING_ALGORITHM,
  OAuthTokenType,
  getOAuthSigningKey,
} from "./oauth-signing";

// Published keys change rarely and an unknown `kid` forces a refresh anyway,
// so a long cache is safe and keeps a short outage of the key server from
// affecting requests.
const DEFAULT_CACHE_MAX_AGE_MS = 60 * 60 * 1000;
// After a refetch, no further refetch for this long. Stops a flood of tokens
// with made-up key ids from turning into a flood of requests to the key server.
const DEFAULT_COOLDOWN_MS = 30 * 1000;
// Allowed clock difference between the issuer and this server. Only used with a
// remote issuer. Locally the same machine signed the token.
const REMOTE_CLOCK_TOLERANCE_SECONDS = 5;

export interface AccessTokenCheck {
  /** Verify with the keys published here. When unset, use the local signing key. */
  jwksUri?: string;
  issuer: string;
  audience: string;
  cacheMaxAgeMs?: number;
  cooldownMs?: number;
}

// One key set per URL and cache setting, so the cache survives across requests.
const remoteKeySets = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

function remoteKeySet(check: AccessTokenCheck & { jwksUri: string }) {
  const cacheMaxAge = check.cacheMaxAgeMs ?? DEFAULT_CACHE_MAX_AGE_MS;
  const cooldownDuration = check.cooldownMs ?? DEFAULT_COOLDOWN_MS;
  const cacheKey = `${check.jwksUri}|${cacheMaxAge}|${cooldownDuration}`;
  let keySet = remoteKeySets.get(cacheKey);
  if (!keySet) {
    keySet = createRemoteJWKSet(new URL(check.jwksUri), {
      cacheMaxAge,
      cooldownDuration,
    });
    remoteKeySets.set(cacheKey, keySet);
  }
  return keySet;
}

/** Forgets every cached key set. For tests. */
export function clearJwksCache(): void {
  remoteKeySets.clear();
}

// Errors that mean "this token is not valid". Anything else (the key server
// timing out, an unreadable key set, a network error) is a problem on our side
// of the check, not a bad token.
const INVALID_TOKEN_ERROR_CODES = new Set([
  "ERR_JWT_EXPIRED",
  "ERR_JWT_CLAIM_VALIDATION_FAILED",
  "ERR_JWT_INVALID",
  "ERR_JWS_INVALID",
  "ERR_JWS_SIGNATURE_VERIFICATION_FAILED",
  "ERR_JOSE_ALG_NOT_ALLOWED",
  "ERR_JOSE_NOT_SUPPORTED",
  "ERR_JWKS_NO_MATCHING_KEY",
  "ERR_JWKS_MULTIPLE_MATCHING_KEYS",
]);

/**
 * Verifies an access token against the given settings.
 *
 * @throws a 401 if the token is not valid, a 503 if the keys could not be
 * fetched (clients should keep their token and retry), and a 500 if the local
 * signing key is missing or unusable.
 */
export async function verifyAccessTokenWith(
  token: string,
  check: AccessTokenCheck,
): Promise<JWTPayload> {
  // In local mode this is the part that fails with a 500 on a bad key. Kept
  // outside the try block below so a configuration problem is not reported as
  // an invalid token.
  const key = check.jwksUri
    ? remoteKeySet({ ...check, jwksUri: check.jwksUri })
    : getOAuthSigningKey().publicKey;

  try {
    const { payload } = await jwtVerify(token, key as never, {
      algorithms: [OAUTH_SIGNING_ALGORITHM],
      typ: OAuthTokenType.Access,
      issuer: check.issuer,
      audience: check.audience,
      requiredClaims: ["exp", "sub"],
      clockTolerance: check.jwksUri ? REMOTE_CLOCK_TOLERANCE_SECONDS : 0,
    });
    return payload;
  } catch (error) {
    if (
      error instanceof errors.JOSEError &&
      INVALID_TOKEN_ERROR_CODES.has(error.code)
    ) {
      throw new createHttpError.Unauthorized("Invalid or expired access token");
    }
    logger.error(
      { err: error, jwksUri: check.jwksUri },
      "Could not verify an access token",
    );
    // Exposed on purpose: errorHandler turns every 5xx that is not exposed into
    // a plain 500, and clients need the 503 to know they should keep their
    // token and try again. The message says nothing about our setup.
    throw createHttpError(503, "Unable to verify the access token right now", {
      expose: true,
    });
  }
}

/** Verifies an access token sent to this API, using the configured settings. */
export function verifyAccessToken(
  token: string,
  req: Request,
): Promise<JWTPayload> {
  return verifyAccessTokenWith(token, {
    jwksUri: getOAuthJwksUri(),
    issuer: getOAuthIssuer(req),
    audience: getOAuthAudience(req),
  });
}
