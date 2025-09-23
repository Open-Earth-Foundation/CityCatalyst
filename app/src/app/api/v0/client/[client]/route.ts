/**
 * @swagger
 * /api/v0/client/{client}:
 *   get:
 *     tags:
 *       - OAuth Clients
 *     summary: Get a single OAuth client by ID with localized metadata.
 *     description: Fetches a client and merges its i18n name/description entries by language. Requires a signed‑in session and OAUTH_ENABLED. Response is wrapped in { data }.
 *     parameters:
 *       - in: path
 *         name: client
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Client wrapped in data.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     clientId:
 *                       type: string
 *                     redirectUri:
 *                       type: string
 *                       format: uri
 *                     name:
 *                       type: object
 *                       additionalProperties:
 *                         type: string
 *                     description:
 *                       type: object
 *                       additionalProperties:
 *                         type: string
 *             examples:
 *               example:
 *                 value:
 *                   data:
 *                     clientId: "abc123"
 *                     redirectUri: "https://app.example.com/callback"
 *                     name: { en: "Example App" }
 *                     description: { en: "Demo client" }
 *       401:
 *         description: Must be logged in.
 *       404:
 *         description: Client not found.
 *       500:
 *         description: OAuth not enabled or server error.
 *   delete:
 *     tags:
 *       - OAuth Clients
 *     summary: Delete an OAuth client by ID.
 *     description: Permanently removes a client record. Requires a signed‑in session and OAUTH_ENABLED. Returns 204 with no body on success.
 *     parameters:
 *       - in: path
 *         name: client
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       204:
 *         description: Client deleted.
 *       401:
 *         description: Must be logged in.
 *       404:
 *         description: Client not found.
 *       500:
 *         description: OAuth not enabled or server error.
 */
import { apiHandler } from "@/util/api";
import createHttpError from "http-errors";
import { NextResponse } from "next/server";
import { hasFeatureFlag, FeatureFlags } from "@/util/feature-flags";
import { OAuthClient } from "@/models/OAuthClient";
import { OAuthClientI18N } from "@/models/OAuthClientI18N";
import { Client } from "@/util/types";

/** gets a client based on client ID */
export const GET = apiHandler(async (_req, { params, session }) => {
  if (!hasFeatureFlag(FeatureFlags.OAUTH_ENABLED)) {
    throw createHttpError.InternalServerError("OAuth 2.0 not enabled");
  }

  if (!session) {
    throw new createHttpError.Unauthorized("Must be logged in!");
  }

  const { client: clientId } = params;

  const client = await OAuthClient.findByPk(clientId);

  if (!client) {
    throw new createHttpError.NotFound(`No client with id ${clientId}`);
  }

  const results: Client = {
    clientId,
    redirectUri: client.redirectURI,
    name: {},
    description: {},
  };

  const i18ns = await OAuthClientI18N.findAll({ where: { clientId } });

  for (const i18n of i18ns) {
    if (i18n.name) {
      results.name[i18n.language] = i18n.name;
    }
    if (i18n.description) {
      results.description[i18n.language] = i18n.description;
    }
  }

  return NextResponse.json({ data: results });
});

/** deletes a client */
export const DELETE = apiHandler(async (_req, { params, session }) => {
  if (!hasFeatureFlag(FeatureFlags.OAUTH_ENABLED)) {
    throw createHttpError.InternalServerError("OAuth 2.0 not enabled");
  }

  if (!session) {
    throw new createHttpError.Unauthorized("Must be logged in!");
  }

  const { client: clientId } = params;

  const client = await OAuthClient.findByPk(clientId);

  if (!client) {
    throw new createHttpError.NotFound(`No client with id ${clientId}`);
  }

  await client.destroy();

  return new NextResponse(null, { status: 204 });
});
