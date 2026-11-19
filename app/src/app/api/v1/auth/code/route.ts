/**
 * @swagger
 * /api/v1/auth/code:
 *   post:
 *     tags:
 *       - auth
 *     operationId: postAuthCode
 *     summary: Issue a short‑lived OAuth authorization code for the current user.
 *     description: Validates the OAuth client and CSRF token, then issues an opaque authorization code bound to the client, redirect URI, PKCE challenge, scope and user. The code is valid for 60 seconds, can be used once, and must be exchanged for tokens at `/api/v1/token`. Only its hash is stored. Requires an authenticated user session and the OAUTH_ENABLED feature flag. Use this endpoint as part of the OAuth 2.0 Authorization Code flow, or the OpenID Connect flow when the scope includes `openid`.
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
 *                 description: PKCE code challenge for enhanced security (base64url encoded SHA256 hash, 43 characters)
 *               scope:
 *                 type: string
 *                 description: Space-separated list of OAuth scopes requested by the client. Allowed values are `openid`, `read` and `write`.
 *               nonce:
 *                 type: string
 *                 maxLength: 255
 *                 description: Value from the OpenID Connect authentication request. It is returned unchanged in the id_token.
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
 *                       description: Opaque authorization code, valid for 60 seconds and single use
 *             examples:
 *               example:
 *                 value:
 *                   data:
 *                     code: "Qm9ndXNDb2RlRXhhbXBsZUZvckRvY3NPbmx5MDEyMzQ1Njc"
 *       400:
 *         description: Invalid request body, unknown scope, invalid client ID, redirect URI mismatch, or CSRF token validation failure.
 *       401:
 *         description: User is not authenticated or lacks valid session.
 *       500:
 *         description: OAuth feature not enabled or internal server error.
 */
import { apiHandler } from "@/util/api";
import createHttpError from "http-errors";
import { NextResponse } from "next/server";
import { z } from "zod";
import AuthorizationCodeService from "@/backend/oauth/AuthorizationCodeService";
import { OAuthClient } from "@/models/OAuthClient";
import crypto from "node:crypto";
import { FeatureFlags, hasFeatureFlag } from "@/util/feature-flags";
import { OAuthClientAuthz } from "@/models/OAuthClientAuthz";

const ALLOWED_SCOPES = ["openid", "read", "write"];

const codeRequest = z.object({
  clientId: z.string().min(1).max(64),
  redirectUri: z.string().min(1).max(2048),
  // S256 is the base64url of a SHA-256 hash: always 43 characters.
  codeChallenge: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
  scope: z
    .string()
    .transform((value) => value.split(" ").filter(Boolean))
    .refine(
      (scopes) =>
        scopes.length > 0 && scopes.every((s) => ALLOWED_SCOPES.includes(s)),
      { message: `scope must use only: ${ALLOWED_SCOPES.join(", ")}` },
    ),
  nonce: z.string().min(1).max(255).optional(),
  csrfToken: z.string().min(1),
});

/** Return an authorization code */

export const POST = apiHandler(async (req, { session }) => {
  if (!hasFeatureFlag(FeatureFlags.OAUTH_ENABLED)) {
    throw createHttpError.InternalServerError("OAuth 2.0 not enabled");
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

  const { clientId, redirectUri, codeChallenge, scope, nonce, csrfToken } =
    codeRequest.parse(await req.json());

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

  await OAuthClientAuthz.upsert({
    clientId,
    userId: session.user.id,
    lastUsed: new Date(),
  });

  const code = await AuthorizationCodeService.issue({
    clientId,
    userId: session.user.id,
    redirectUri,
    codeChallenge,
    scope: scope.join(" "),
    nonce,
  });

  return NextResponse.json({
    data: {
      code,
    },
  });
});
