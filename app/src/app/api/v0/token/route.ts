/**
 * @swagger
 * /api/v0/token:
 *   post:
 *     tags:
 *       - Auth
 *     summary: Exchange an authorization code for access and refresh tokens (OAuth 2.0 PKCE).
 *     description: Accepts a short‑lived authorization code issued by the server and returns a bearer access token plus a refresh token. Requires the OAUTH_ENABLED feature flag and the content type application/x-www-form-urlencoded; no user session is required for this exchange. Validates client_id/redirect_uri, token issuer/audience, single‑use code, and PKCE S256 challenge.
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
 *                 enum: [authorization_code]
 *               code:
 *                 type: string
 *               redirect_uri:
 *                 type: string
 *                 format: uri
 *               client_id:
 *                 type: string
 *               code_verifier:
 *                 type: string
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
 *             examples:
 *               example:
 *                 value:
 *                   access_token: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
 *                   token_type: "Bearer"
 *                   expires_in: 604800
 *                   refresh_token: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
 *                   scope: "read write"
 *       400:
 *         description: Invalid request parameters or verification failed (e.g., client/redirect mismatch, expired/invalid code, PKCE failure, reused code).
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
import jwt from "jsonwebtoken";
import { logger } from "@/services/logger";
import { createHash } from "node:crypto";
import { hasFeatureFlag, FeatureFlags } from "@/util/feature-flags";
import TTLCache from "@isaacs/ttlcache";
import { OAuthClientAuthz } from "@/models/OAuthClientAuthz";

// 10-minute cache, for checking jwtid replay

const cache = new TTLCache({ max: 10000, ttl: 10 * 60 * 1000 })

const ACCESS_TOKEN_EXPIRY = 7 * 24 * 60 * 60;
const REFRESH_TOKEN_EXPIRY = 30 * 24 * 60 * 60;

function verifyPKCE(verifier: string, challenge: string): boolean {
  const hash = createHash("sha256").update(verifier, "ascii").digest();
  const base64url = hash
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  return base64url === challenge;
}

const authorizationCodeRequest = z.object({
  grant_type: z.literal("authorization_code"),
  code: z.string().min(1, "code is required"),
  redirect_uri: z.string().url("redirect_uri must be a valid URI"),
  client_id: z.string().min(1, "client_id is required"),
  code_verifier: z.string()
});

const refreshTokenRequest = z.object({
  grant_type: z.literal("refresh_token"),
  refresh_token: z.string().min(1, "refresh_token is required"),
  scope: z.string().optional()
})

/** accept an authorization code and return an access token  */
export const POST = apiHandler(async (_req, { params, session }) => {

  if (!hasFeatureFlag(FeatureFlags.OAUTH_ENABLED)) {
    throw createHttpError.InternalServerError("OAuth 2.0 not enabled");
  }

  if (!process.env.VERIFICATION_TOKEN_SECRET) {
    logger.error("Need to assign VERIFICATION_TOKEN_SECRET in env!");
    throw createHttpError.InternalServerError("Configuration error");
  }

  const key = process.env.VERIFICATION_TOKEN_SECRET;
  const contentType = _req.headers.get('content-type') || ''

  if (!contentType.includes('application/x-www-form-urlencoded')) {
    return NextResponse.json(
      { error: 'unsupported_content_type' },
      { status: 415 }
    )
  }

  const formData = await _req.formData()

  const formObj: Record<string, unknown> = {};
  for (const [key, value] of formData.entries()) {
    formObj[key] = value;
  }

  switch (formObj.grant_type) {
    case 'authorization_code': {
      const tr = authorizationCodeRequest.parse(formObj);
      return await handleAuthorizationCodeRequest(_req, tr, key)
    }
    case 'refresh_token': {
      const rtr = refreshTokenRequest.parse(formObj);
      return await handleRefreshTokenRequest(_req, rtr, key);
    }
    default: {
      throw createHttpError.BadRequest("Only 'authorization_code' or 'refresh_token' grant_type allowed")
    }
  }
})

async function handleAuthorizationCodeRequest(
  _req: NextRequest,
  tr: any,
  key: string
) {

  const client = await OAuthClient.findByPk(tr.client_id);

  if (!client) {
    throw new createHttpError.BadRequest("Unrecognized client_id")
  }

  if (client.redirectURI !== tr.redirect_uri) {
    throw new createHttpError.BadRequest("redirect_uri mismatch")
  }

  let decoded: any;

  try {
    decoded = jwt.verify(
      tr.code,
      key
    )
  } catch (error: any) {
    if (error.name === "TokenExpiredError") {
      throw createHttpError.BadRequest("Code has expired.");
    } else {
      throw createHttpError.BadRequest("Invalid reset token.");
    }
  }

  logger.debug({decoded}, 'Decoded authorization code');

  const origin = process.env.HOST || (new URL(_req.url)).origin;

  if (decoded.iss !== origin) {
    throw createHttpError.BadRequest("code issued by a different server.");
  }

  if (decoded.aud !== origin) {
    throw createHttpError.BadRequest("code issued for a different server.");
  }

  if (decoded.client_id !== tr.client_id) {
    throw createHttpError.BadRequest("client_id mismatch with code.");
  }

  if (decoded.redirect_uri !== tr.redirect_uri) {
    throw createHttpError.BadRequest("redirect_uri mismatch with code.");
  }

  const codeChallenge = decoded.code_challenge;

  if (!verifyPKCE(tr.code_verifier, codeChallenge)) {
    throw createHttpError.BadRequest("PKCE verification failed.");
  }

  // Same as 'jwtid' on input in code endpoint!

  const jwtid = decoded.jti;

  if (!jwtid) {
    throw createHttpError.BadRequest("No jwtid in code.");
  }

  logger.debug(
    {jwtid},
    'Checking for replay of jwtid for authorization token'
  );

  if (cache.has(jwtid)) {
    logger.debug(
      {jwtid},
      'Cache hit'
    );
    throw createHttpError.BadRequest("Single-use code.");
  }

  logger.debug(
    {jwtid},
    'Cache miss'
  );

  cache.set(jwtid, true);

  const scope = decoded.scope;

  const accessToken = jwt.sign({
      client_id: tr.client_id,
      scope
    },
    key,
    {
      expiresIn: ACCESS_TOKEN_EXPIRY,
      issuer: origin,
      audience: origin,
      subject: decoded.sub
    }
  );

  const refreshToken = jwt.sign({
      client_id: tr.client_id,
      scope
    },
    key,
    {
      expiresIn: REFRESH_TOKEN_EXPIRY,
      issuer: origin,
      audience: origin,
      subject: decoded.sub
    }
  );

  return NextResponse.json({
    access_token: accessToken,
    token_type: "Bearer",
    expires_in: ACCESS_TOKEN_EXPIRY,
    refresh_token: refreshToken,
    scope
  });
}

async function handleRefreshTokenRequest(
  _req: NextRequest,
  rtr: any,
  key: string
) {

  let decoded: any;

  try {
    decoded = jwt.verify(
      rtr.refresh_token,
      key
    )
  } catch (error: any) {
    if (error.name === "TokenExpiredError") {
      throw createHttpError.BadRequest("Code has expired.");
    } else {
      throw createHttpError.BadRequest("Invalid reset token.");
    }
  }

  logger.debug({decoded}, 'Decoded refresh_token');

  const origin = process.env.HOST || (new URL(_req.url)).origin;

  if (decoded.iss !== origin) {
    throw createHttpError.BadRequest("code issued by a different server.");
  }

  if (decoded.aud !== origin) {
    throw createHttpError.BadRequest("code issued for a different server.");
  }

  const client = await OAuthClient.findByPk(decoded.client_id);

  if (!client) {
    throw new createHttpError.BadRequest("Unrecognized client_id")
  }

  const authz = await OAuthClientAuthz.findOne({
    where: {
      clientId: decoded.client_id,
      userId: decoded.sub,
    },
  });

  if (!authz) {
    throw new createHttpError.Unauthorized("Authorization revoked");
  }

  const scope = decoded.scope;

  const accessToken = jwt.sign({
      client_id: decoded.client_id,
      scope
    },
    key,
    {
      expiresIn: ACCESS_TOKEN_EXPIRY,
      issuer: origin,
      audience: origin,
      subject: decoded.sub
    }
  );

  return NextResponse.json({
    access_token: accessToken,
    token_type: "Bearer",
    expires_in: ACCESS_TOKEN_EXPIRY,
    scope
  });
}
