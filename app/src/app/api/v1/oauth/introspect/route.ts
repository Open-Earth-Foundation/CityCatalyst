/**
 * @swagger
 * /api/v1/oauth/introspect:
 *   post:
 *     tags:
 *       - oauth
 *     operationId: postOauthIntrospect
 *     summary: Introspect an access or refresh token (OAuth 2.0 Token Introspection, RFC 7662).
 *     description: Tells a resource server whether a token is still good, and what it grants. For an access token it checks the signature, issuer, audience, type and expiry, and that the user still has the app authorized. For a refresh token it checks that the token exists, has not been used, revoked or expired, and that the app is still authorized. Only registered resource servers may call it. They authenticate with HTTP Basic and are listed in OAUTH_RESOURCE_SERVERS. A token that is not valid is answered with `active` false and nothing else. Requires the OAUTH_ENABLED feature flag.
 *     security:
 *       - BasicAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/x-www-form-urlencoded:
 *           schema:
 *             type: object
 *             required: [token]
 *             properties:
 *               token:
 *                 type: string
 *                 description: The access token or refresh token to check.
 *               token_type_hint:
 *                 type: string
 *                 description: Accepted and ignored. An access token is told apart from a refresh token by its shape.
 *     responses:
 *       200:
 *         description: The state of the token.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required: [active]
 *               properties:
 *                 active:
 *                   type: boolean
 *                 scope:
 *                   type: string
 *                 client_id:
 *                   type: string
 *                 sub:
 *                   type: string
 *                   description: The id of the user the token was issued to.
 *                 token_type:
 *                   type: string
 *                   description: Present for access tokens.
 *                 iss:
 *                   type: string
 *                 aud:
 *                   type: string
 *                 exp:
 *                   type: integer
 *                 iat:
 *                   type: integer
 *             examples:
 *               active:
 *                 value:
 *                   active: true
 *                   scope: "read write"
 *                   client_id: "my-app"
 *                   sub: "7c0c4b9a-7b60-4f63-b4cc-7b4bcae6a111"
 *                   token_type: "Bearer"
 *                   exp: 1795070994
 *               inactive:
 *                 value:
 *                   active: false
 *       400:
 *         description: The token parameter is missing.
 *       401:
 *         description: The caller is not a registered resource server.
 *       404:
 *         description: OAuth is not enabled.
 *       415:
 *         description: Unsupported content type.
 */
import { apiHandler } from "@/util/api";
import createHttpError from "http-errors";
import { NextResponse } from "next/server";
import { z } from "zod";
import {
  AUTHENTICATES_ITSELF,
  authenticateResourceServer,
} from "@/backend/oauth/ClientAuthentication";
import { readForm } from "@/backend/oauth/form";
import { hasActiveGrant } from "@/backend/oauth/grants";
import RefreshTokenService from "@/backend/oauth/RefreshTokenService";
import { getOAuthAudience, getOAuthIssuer } from "@/lib/auth/oauth-config";
import { verifyAccessTokenWith } from "@/lib/auth/oauth-verify";
import { FeatureFlags, hasFeatureFlag } from "@/util/feature-flags";

const introspectionRequest = z.object({
  token: z.string().min(1, "token is required"),
});

/** The answer for anything that is not a valid token. It says nothing else. */
const INACTIVE = { active: false } as const;

export const POST = apiHandler(async (req) => {
  if (!hasFeatureFlag(FeatureFlags.OAUTH_ENABLED)) {
    throw createHttpError.NotFound("OAuth 2.0 not enabled on this server");
  }

  authenticateResourceServer(req);
  const { token } = introspectionRequest.parse(await readForm(req));

  // An access token is a JWT (three parts with dots). A refresh token is a
  // plain random string.
  const result =
    token.split(".").length === 3
      ? await introspectAccessToken(token, req)
      : await introspectRefreshToken(token);

  return NextResponse.json(result, {
    // The answer is about one user's token. Intermediaries must not store it.
    headers: { "Cache-Control": "no-store" },
  });
}, AUTHENTICATES_ITSELF);

async function introspectAccessToken(token: string, req: Request) {
  let claims;
  try {
    // This server issued the token, so it checks it with its own key even when
    // it has been told to fetch keys for its own API from somewhere else.
    claims = await verifyAccessTokenWith(token, {
      issuer: getOAuthIssuer(req),
      audience: getOAuthAudience(req),
    });
  } catch (error) {
    // An invalid token is an answer, not an error. A misconfigured key is.
    if (createHttpError.isHttpError(error) && error.statusCode === 401) {
      return INACTIVE;
    }
    throw error;
  }

  const clientId = claims.client_id as string | undefined;
  if (!clientId || !claims.sub) return INACTIVE;

  // Reads only: asking about a token must not count as the app being used.
  if (!(await hasActiveGrant(clientId, claims.sub))) return INACTIVE;

  return {
    active: true,
    scope: claims.scope as string | undefined,
    client_id: clientId,
    sub: claims.sub,
    token_type: "Bearer",
    iss: claims.iss,
    aud: claims.aud,
    exp: claims.exp,
    iat: claims.iat,
  };
}

async function introspectRefreshToken(token: string) {
  const row = await RefreshTokenService.findActive(token);
  if (!row) return INACTIVE;

  return {
    active: true,
    scope: row.scope,
    client_id: row.clientId,
    sub: row.userId,
    exp: Math.floor(row.expires.getTime() / 1000),
    iat: Math.floor(row.created.getTime() / 1000),
  };
}
