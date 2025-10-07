/**
 * @swagger
 * /api/v1/auth/code:
 *   post:
 *     tags:
 *       - Auth
 *     summary: Issue a short‑lived OAuth authorization code for the current user.
 *     description: Validates the OAuth client credentials and CSRF token, then generates a signed JWT authorization code using PKCE for enhanced security. The code is valid for 5 minutes and must be exchanged for tokens immediately. Requires an authenticated user session and the OAUTH_ENABLED feature flag. Use this endpoint as part of the OAuth 2.0 Authorization Code flow before exchanging the code for access tokens at `/api/v1/token`.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [clientId, redirectUri, codeChallenge, scope, csrfToken]
 *             properties:
 *               clientId:
 *                 type: string
 *                 description: OAuth client identifier registered in the system
 *               redirectUri:
 *                 type: string
 *                 format: uri
 *                 description: The callback URL where the authorization code will be sent
 *               codeChallenge:
 *                 type: string
 *                 description: PKCE code challenge for enhanced security (base64url encoded SHA256 hash)
 *               scope:
 *                 type: string
 *                 description: Space-separated list of OAuth scopes requested by the client
 *               csrfToken:
 *                 type: string
 *                 description: CSRF protection token obtained from the session
 *     responses:
 *       200:
 *         description: Code wrapped in a data object.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     code:
 *                       type: string
 *                       description: Short-lived JWT authorization code that expires in 5 minutes
 *             examples:
 *               example:
 *                 value:
 *                   data:
 *                     code: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
 *       400:
 *         description: Invalid client ID, redirect URI mismatch, or CSRF token validation failure.
 *       401:
 *         description: User is not authenticated or lacks valid session.
 *       500:
 *         description: OAuth feature not enabled, missing configuration, or internal server error.
 */
import { apiHandler } from "@/util/api";
import createHttpError from "http-errors";
import { NextResponse } from "next/server";
import jwt from "jsonwebtoken";
import { logger } from "@/services/logger";
import { v4 } from "uuid";
import { OAuthClient } from "@/models/OAuthClient";
import crypto from "node:crypto";
import { FeatureFlags, hasFeatureFlag } from "@/util/feature-flags";
import { OAuthClientAuthz } from "@/models/OAuthClientAuthz";

/** Return an authorization code */

export const POST = apiHandler(async (req, { params, session }) => {
  if (!hasFeatureFlag(FeatureFlags.OAUTH_ENABLED)) {
    throw createHttpError.InternalServerError("OAuth 2.0 not enabled");
  }

  if (!process.env.VERIFICATION_TOKEN_SECRET) {
    logger.error("Need to assign VERIFICATION_TOKEN_SECRET in env!");
    throw createHttpError.InternalServerError("Configuration error");
  }

  if (!session) {
    throw new createHttpError.Unauthorized(
      "Not signed in as the requested user",
    );
  }

  const csrfSecret = session.csrfSecret;

  if (!csrfSecret) {
    throw createHttpError.InternalServerError("Error in server");
  }

  const { clientId, redirectUri, codeChallenge, scope, csrfToken } =
    await req.json();

  if (csrfToken !== crypto.createHmac("sha256", csrfSecret).digest("hex")) {
    throw createHttpError.BadRequest("csrfToken does not match");
  }

  const client = await OAuthClient.findByPk(clientId);

  if (!client) {
    throw new createHttpError.BadRequest(`No such client: ${clientId}`);
  }

  if (client.redirectURI !== redirectUri) {
    throw new createHttpError.BadRequest("Redirect URI mismatch");
  }

  const origin = process.env.HOST || new URL(req.url).origin;

  await OAuthClientAuthz.upsert({
    clientId,
    userId: session.user.id,
    lastUsed: new Date(),
  });

  const jwtid = v4();

  logger.debug({ jwtid }, "Creating JWT");

  const code = jwt.sign(
    {
      client_id: clientId,
      redirect_uri: redirectUri,
      scope,
      code_challenge: codeChallenge,
    },
    process.env.VERIFICATION_TOKEN_SECRET,
    {
      expiresIn: "5m",
      issuer: origin,
      audience: origin,
      subject: session.user.id,
      jwtid,
    },
  );
  return NextResponse.json({
    data: {
      code,
    },
  });
});
