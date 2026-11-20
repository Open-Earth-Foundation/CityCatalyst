/**
 * @swagger
 * /api/v1/token:
 *   post:
 *     tags:
 *       - auth
 *     operationId: postToken
 *     summary: Exchange an authorization code or a refresh token for access and refresh tokens (OAuth 2.0 PKCE).
 *     description: Accepts a short‑lived authorization code issued by the server and returns a bearer access token plus a refresh token. When the code was issued for the `openid` scope, the response also contains an `id_token` (OpenID Connect). Requires the OAUTH_ENABLED feature flag and the content type application/x-www-form-urlencoded; no user session is required for this exchange. Validates client_id/redirect_uri, that the code is unexpired and unused, and the PKCE S256 challenge. A code is spent by its first exchange attempt, even a failed one. The refresh_token grant (`grant_type=refresh_token` with `refresh_token`, plus `client_id` for a public client) returns a new access token and a new refresh token. The refresh token that was used stops working, and presenting it again revokes every refresh token issued from the same authorization. Access tokens last 15 minutes. A refresh token lasts 30 days from the moment it is issued. A confidential client authenticates with HTTP Basic.
 *     requestBody:
 *       required: true
 *       content:
 *         application/x-www-form-urlencoded:
 *           schema:
 *             type: object
 *             required: [grant_type, code, redirect_uri, client_id, code_verifier]
 *             properties:
 *               grant_type:
 *                 type: string
 *                 enum: [authorization_code, refresh_token]
 *               code:
 *                 type: string
 *               redirect_uri:
 *                 type: string
 *                 format: uri
 *               client_id:
 *                 type: string
 *               code_verifier:
 *                 type: string
 *               refresh_token:
 *                 type: string
 *                 description: For grant_type refresh_token. The code, redirect_uri and code_verifier fields are then not sent.
 *     security:
 *       - {}
 *       - BasicAuth: []
 *     responses:
 *       200:
 *         description: Tokens issued successfully.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 access_token:
 *                   type: string
 *                 token_type:
 *                   type: string
 *                 expires_in:
 *                   type: integer
 *                 refresh_token:
 *                   type: string
 *                 scope:
 *                   type: string
 *                 id_token:
 *                   type: string
 *                   description: Signed JWT (RS256) that identifies the user. Present only when the scope includes `openid`. Valid for 15 minutes. Carries `nonce` when one was sent with the authorization request.
 *             examples:
 *               example:
 *                 value:
 *                   access_token: "eyJhbGciOiJSUzI1NiIsInR5cCI6ImF0K2p3dCJ9..."
 *                   token_type: "Bearer"
 *                   expires_in: 900
 *                   refresh_token: "q2n0vXk1c8Zr3e9bYt5Jw7uLx4Ha6MdPoTgS0RfVnA"
 *                   scope: "openid read write"
 *                   id_token: "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9..."
 *       400:
 *         description: Invalid request parameters or verification failed (e.g., client/redirect mismatch, expired/invalid code, PKCE failure, reused code, unknown/expired/used refresh token).
 *       401:
 *         description: The client could not be identified (a confidential client needs HTTP Basic credentials), or the user has revoked the app.
 *       415:
 *         description: Unsupported content type.
 *       500:
 *         description: OAuth not enabled or configuration error.
 */
import { apiHandler } from "@/util/api";
import createHttpError from "http-errors";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { OAuthClient } from "@/models/OAuthClient";
import {
  getOAuthSigningKey,
  OAuthTokenType,
  signOAuthToken,
} from "@/lib/auth/oauth-signing";
import AuthorizationCodeService from "@/backend/oauth/AuthorizationCodeService";
import {
  AUTHENTICATES_ITSELF,
  authenticateClient,
} from "@/backend/oauth/ClientAuthentication";
import RefreshTokenService from "@/backend/oauth/RefreshTokenService";
import { getOAuthAudience, getOAuthIssuer } from "@/lib/auth/oauth-config";
import IdentityClaimsService from "@/backend/oauth/IdentityClaimsService";
import { hasFeatureFlag, FeatureFlags } from "@/util/feature-flags";

// Short, so that revoking an app or deleting a user takes hold quickly. A client
// that wants to keep going uses its refresh token.
const ACCESS_TOKEN_EXPIRY = 15 * 60;
const ID_TOKEN_EXPIRY = 15 * 60;

const authorizationCodeRequest = z.object({
  grant_type: z.literal("authorization_code"),
  code: z.string().min(1, "code is required"),
  redirect_uri: z.string().url("redirect_uri must be a valid URI"),
  client_id: z.string().min(1, "client_id is required"),
  code_verifier: z.string(),
});

const refreshTokenRequest = z.object({
  grant_type: z.literal("refresh_token"),
  refresh_token: z.string().min(1, "refresh_token is required"),
  // A public client names itself here. A confidential client uses HTTP Basic.
  client_id: z.string().optional(),
  scope: z.string().optional(),
});

/** accept an authorization code and return an access token  */
export const POST = apiHandler(async (_req) => {
  if (!hasFeatureFlag(FeatureFlags.OAUTH_ENABLED)) {
    throw createHttpError.InternalServerError("OAuth 2.0 not enabled");
  }

  // Fails with a 500 if OAUTH_SIGNING_KEY is missing or invalid. Checked here,
  // outside the try blocks below, so a configuration problem is not reported
  // to the client as an invalid code.
  getOAuthSigningKey();

  const contentType = _req.headers.get("content-type") || "";

  if (!contentType.includes("application/x-www-form-urlencoded")) {
    return NextResponse.json(
      { error: "unsupported_content_type" },
      { status: 415 },
    );
  }

  const formData = await _req.formData();

  const formObj: Record<string, unknown> = {};
  for (const [key, value] of formData.entries()) {
    formObj[key] = value;
  }

  switch (formObj.grant_type) {
    case "authorization_code": {
      const tr = authorizationCodeRequest.parse(formObj);
      return await handleAuthorizationCodeRequest(_req, tr);
    }
    case "refresh_token": {
      const rtr = refreshTokenRequest.parse(formObj);
      return await handleRefreshTokenRequest(_req, rtr);
    }
    default: {
      throw createHttpError.BadRequest(
        "Only 'authorization_code' or 'refresh_token' grant_type allowed",
      );
    }
  }
}, AUTHENTICATES_ITSELF);

async function handleAuthorizationCodeRequest(
  _req: NextRequest,
  tr: z.infer<typeof authorizationCodeRequest>,
) {
  const client = await OAuthClient.findByPk(tr.client_id);

  if (!client) {
    throw new createHttpError.BadRequest("Unrecognized client_id");
  }

  if (client.redirectURI !== tr.redirect_uri) {
    throw new createHttpError.BadRequest("redirect_uri mismatch");
  }

  // A confidential client must prove who it is. A public client has PKCE.
  if (client.clientSecretHash) {
    await authenticateClient(_req, tr.client_id);
  }

  // Checks expiry, single use, client, redirect URI and PKCE. The code is spent
  // by this call, so it cannot be tried a second time.
  const grant = await AuthorizationCodeService.redeem({
    code: tr.code,
    clientId: tr.client_id,
    redirectUri: tr.redirect_uri,
    codeVerifier: tr.code_verifier,
  });

  const issuer = getOAuthIssuer(_req);
  const audience = getOAuthAudience(_req);
  const scope = grant.scope;

  const accessToken = signOAuthToken(
    OAuthTokenType.Access,
    {
      client_id: tr.client_id,
      scope,
    },
    {
      expiresIn: ACCESS_TOKEN_EXPIRY,
      issuer,
      audience,
      subject: grant.userId,
    },
  );

  // Starts a new family of refresh tokens. Each refresh replaces the token
  // with the next one.
  const refresh = await RefreshTokenService.issue({
    clientId: tr.client_id,
    userId: grant.userId,
    scope,
  });

  const response: Record<string, unknown> = {
    access_token: accessToken,
    token_type: "Bearer",
    expires_in: ACCESS_TOKEN_EXPIRY,
    refresh_token: refresh.token,
    scope,
  };

  // OpenID Connect: only requests with the `openid` scope get an id_token.
  if (scope.split(" ").includes("openid")) {
    response.id_token = await issueIdToken({
      userId: grant.userId,
      clientId: tr.client_id,
      nonce: grant.nonce,
      issuer,
    });
  }

  return NextResponse.json(response);
}

/**
 * Builds the id_token (OpenID Connect Core section 2). It is meant for the
 * client, not for calling APIs: `aud` is the client id, not this server.
 */
async function issueIdToken(params: {
  userId: string;
  clientId: string;
  nonce: string | null;
  issuer: string;
}): Promise<string> {
  const [claims, amr] = await Promise.all([
    IdentityClaimsService.forUser(params.userId),
    IdentityClaimsService.authenticationMethods(params.userId),
  ]);
  // `sub` is set through the signing options below.
  const { sub, ...identity } = claims;

  return signOAuthToken(
    OAuthTokenType.Id,
    {
      ...identity,
      amr,
      // Echoed unchanged so the client can tie the token to its own request.
      ...(params.nonce ? { nonce: params.nonce } : {}),
    },
    {
      expiresIn: ID_TOKEN_EXPIRY,
      issuer: params.issuer,
      audience: params.clientId,
      subject: sub,
    },
  );
}

/**
 * The refresh_token grant. Exchanges a refresh token for a new access token and
 * the next refresh token (rotation). The old refresh token stops working.
 */
async function handleRefreshTokenRequest(
  _req: NextRequest,
  rtr: z.infer<typeof refreshTokenRequest>,
) {
  // Who is asking. A refresh token only works for the client it was issued to.
  const client = await authenticateClient(_req, rtr.client_id);

  // Throws if the token is unknown, expired or revoked, if the app was revoked,
  // or if the token was used before (which revokes its family).
  const rotated = await RefreshTokenService.rotate({
    token: rtr.refresh_token,
    clientId: client.clientId,
  });

  const accessToken = signOAuthToken(
    OAuthTokenType.Access,
    {
      client_id: rotated.clientId,
      scope: rotated.scope,
    },
    {
      expiresIn: ACCESS_TOKEN_EXPIRY,
      issuer: getOAuthIssuer(_req),
      audience: getOAuthAudience(_req),
      subject: rotated.userId,
    },
  );

  return NextResponse.json({
    access_token: accessToken,
    token_type: "Bearer",
    expires_in: ACCESS_TOKEN_EXPIRY,
    refresh_token: rotated.token,
    scope: rotated.scope,
  });
}