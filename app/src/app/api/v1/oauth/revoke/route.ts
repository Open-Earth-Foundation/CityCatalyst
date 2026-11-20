/**
 * @swagger
 * /api/v1/oauth/revoke:
 *   post:
 *     tags:
 *       - oauth
 *     operationId: postOauthRevoke
 *     summary: Revoke a refresh token (OAuth 2.0 Token Revocation, RFC 7009).
 *     description: Revokes a refresh token and every other refresh token issued from the same authorization, so the client has to authorize again. The caller is the client the token was issued to. A public client sends its `client_id`. A confidential client authenticates with HTTP Basic. The answer is 200 even when the token is unknown, expired or belongs to another client, so it reveals nothing. Access tokens cannot be revoked one by one. They expire after 15 minutes, and revoking the refresh token stops them from being renewed. Requires the OAUTH_ENABLED feature flag.
 *     security:
 *       - {}
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
 *                 description: The refresh token to revoke.
 *               token_type_hint:
 *                 type: string
 *                 description: Accepted and ignored. A refresh token is told apart from an access token by its shape.
 *               client_id:
 *                 type: string
 *                 description: Required for a public client. A confidential client sends HTTP Basic credentials instead.
 *     responses:
 *       200:
 *         description: The request was processed. There is no body.
 *       400:
 *         description: The token parameter is missing.
 *       401:
 *         description: The client could not be identified.
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
  authenticateClient,
} from "@/backend/oauth/ClientAuthentication";
import { readForm } from "@/backend/oauth/form";
import RefreshTokenService from "@/backend/oauth/RefreshTokenService";
import { FeatureFlags, hasFeatureFlag } from "@/util/feature-flags";

const revocationRequest = z.object({
  token: z.string().min(1, "token is required"),
  client_id: z.string().optional(),
});

export const POST = apiHandler(async (req) => {
  if (!hasFeatureFlag(FeatureFlags.OAUTH_ENABLED)) {
    throw createHttpError.NotFound("OAuth 2.0 not enabled on this server");
  }

  const body = revocationRequest.parse(await readForm(req));
  const client = await authenticateClient(req, body.client_id);

  await RefreshTokenService.revokeByToken(body.token, client.clientId);

  return new NextResponse(null, { status: 200 });
}, AUTHENTICATES_ITSELF);
