/**
 * @swagger
 * /api/v0/auth/code:
 *   post:
 *     tags:
 *       - Auth
 *     summary: Issue a short‑lived OAuth authorization code for the current user.
 *     description: Validates the client and CSRF token, then generates a signed authorization code (PKCE) for the authenticated user. Requires a signed‑in session and OAUTH_ENABLED; non‑authenticated requests fail with 401. Use this before exchanging the code for tokens at `/api/v0/token`.
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
 *               redirectUri:
 *                 type: string
 *                 format: uri
 *               codeChallenge:
 *                 type: string
 *               scope:
 *                 type: string
 *               csrfToken:
 *                 type: string
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
 *             examples:
 *               example:
 *                 value:
 *                   data:
 *                     code: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
 *       400:
 *         description: Invalid client/redirect URI or CSRF mismatch.
 *       401:
 *         description: Not authenticated.
 *       500:
 *         description: OAuth not enabled or configuration error.
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
      jwtid: v4(),
    },
  );
  return NextResponse.json({
    data: {
      code,
    },
  });
});
