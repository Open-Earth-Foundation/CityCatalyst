/**
 * @swagger
 * /api/v1/oauth/userinfo:
 *   get:
 *     tags:
 *       - oauth
 *     operationId: getOauthUserinfo
 *     summary: OpenID Connect UserInfo endpoint.
 *     description: Returns identity claims for the user an OAuth access token was issued to. The token must carry the `openid` scope. Requires the OAUTH_ENABLED feature flag. Supports GET and POST, as OpenID Connect Core section 5.3 requires.
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Identity claims for the token's user.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required:
 *                 - sub
 *                 - org_ids
 *               properties:
 *                 sub:
 *                   type: string
 *                   format: uuid
 *                   description: The user id. The same value as the `sub` of the id_token.
 *                 email:
 *                   type: string
 *                   description: Email address, when the user has one.
 *                 name:
 *                   type: string
 *                   description: Display name, when the user has one.
 *                 org_ids:
 *                   type: array
 *                   items:
 *                     type: string
 *                     format: uuid
 *                   description: Organizations the user belongs to right now. Not a statement of what the user may do.
 *       401:
 *         description: Missing, invalid or expired token, or the token has no `openid` scope.
 *       404:
 *         description: The user no longer exists.
 *   post:
 *     tags:
 *       - oauth
 *     operationId: postOauthUserinfo
 *     summary: OpenID Connect UserInfo endpoint (POST).
 *     description: Same as the GET operation. Provided because OpenID Connect Core section 5.3 requires both methods. The token must carry the `openid` scope. It does not need `write`.
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Identity claims for the token's user. Same body as the GET operation.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required:
 *                 - sub
 *                 - org_ids
 *               properties:
 *                 sub:
 *                   type: string
 *                   format: uuid
 *                 email:
 *                   type: string
 *                 name:
 *                   type: string
 *                 org_ids:
 *                   type: array
 *                   items:
 *                     type: string
 *                     format: uuid
 *       401:
 *         description: Missing, invalid or expired token, or the token has no `openid` scope.
 *       404:
 *         description: The user no longer exists.
 */
import { apiHandler } from "@/util/api";
import createHttpError from "http-errors";
import { NextResponse } from "next/server";
import IdentityClaimsService from "@/backend/oauth/IdentityClaimsService";

// The scope is `openid` for both methods. Without this option a POST would
// need `write`, which has nothing to do with reading your own profile.
const options = { oauthScope: "openid" };

const handler = apiHandler(async (req, { session }) => {
  // This endpoint is for OAuth access tokens. A browser cookie is not one.
  if (!session || !req.headers.get("authorization")) {
    throw new createHttpError.Unauthorized("Bearer access token required");
  }

  const claims = await IdentityClaimsService.forUser(session.user.id);
  return NextResponse.json(claims, {
    // Profile data of one user. Intermediaries must not store it.
    headers: { "Cache-Control": "no-store" },
  });
}, options);

export const GET = handler;
export const POST = handler;
