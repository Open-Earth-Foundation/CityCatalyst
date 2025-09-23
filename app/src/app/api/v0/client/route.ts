/**
 * @swagger
 * /api/v0/client:
 *   get:
 *     tags:
 *       - OAuth Clients
 *     summary: List registered OAuth clients with localized names.
 *     description: Returns all OAuth clients configured on the server, merging i18n name/description records per language. Requires a signed‑in session and OAUTH_ENABLED. Response is wrapped in { data: Client[] }.
 *     responses:
 *       200:
 *         description: Clients array wrapped in data.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       clientId:
 *                         type: string
 *                       redirectUri:
 *                         type: string
 *                         format: uri
 *                       name:
 *                         type: object
 *                         additionalProperties:
 *                           type: string
 *                       description:
 *                         type: object
 *                         additionalProperties:
 *                           type: string
 *             examples:
 *               example:
 *                 value:
 *                   data:
 *                     - clientId: "abc123"
 *                       redirectUri: "https://app.example.com/callback"
 *                       name: { en: "Example App" }
 *                       description: { en: "Demo client" }
 *       401:
 *         description: Must be logged in.
 *       500:
 *         description: OAuth not enabled or server error.
 *   post:
 *     tags:
 *       - OAuth Clients
 *     summary: Create a new OAuth client with localized metadata.
 *     description: Creates a client id with redirect URI and localized name/description entries. Requires a signed‑in session and OAUTH_ENABLED. Returns the created client in { data } and sets a Location header to the new resource.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [redirectUri, name, description]
 *             properties:
 *               redirectUri:
 *                 type: string
 *                 format: uri
 *               name:
 *                 type: object
 *                 additionalProperties:
 *                   type: string
 *               description:
 *                 type: object
 *                 additionalProperties:
 *                   type: string
 *     responses:
 *       201:
 *         description: Created client wrapped in data.
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
 *                     clientId: "def456"
 *                     redirectUri: "https://app.example.com/callback"
 *                     name: { en: "New App" }
 *                     description: { en: "Client description" }
 *       401:
 *         description: Must be logged in.
 *       500:
 *         description: OAuth not enabled or server error.
 */
import { apiHandler } from "@/util/api";
import createHttpError from "http-errors";
import { NextResponse } from "next/server";
import { hasFeatureFlag, FeatureFlags } from "@/util/feature-flags";
import { OAuthClient } from "@/models/OAuthClient";
import { OAuthClientI18N } from "@/models/OAuthClientI18N";
import { Client, LangMap } from "@/util/types";
import { z } from "zod";
import { nanoid } from "nanoid";
import { db } from "@/models";
import { isNamespaceExport } from "typescript";

/** gets all available clients */
export const GET = apiHandler(async (_req, { session }) => {
  if (!hasFeatureFlag(FeatureFlags.OAUTH_ENABLED)) {
    throw createHttpError.InternalServerError("OAuth 2.0 not enabled");
  }

  if (!session) {
    throw new createHttpError.Unauthorized("Must be logged in!");
  }

  const clients = await OAuthClient.findAll();
  const i18ns = await OAuthClientI18N.findAll();

  const results: Client[] = clients.map((cl) => {
    return {
      clientId: cl.clientId,
      redirectUri: cl.redirectURI,
      name: {},
      description: {},
    };
  });

  for (const i18n of i18ns) {
    const cl = results.find((cl) => cl.clientId == i18n.clientId);
    if (!cl) {
      throw createHttpError.InternalServerError(
        `No client with ID ${i18n.clientId}`,
      );
    }
    if (i18n.name) {
      cl.name[i18n.language] = i18n.name;
    }
    if (i18n.description) {
      cl.description[i18n.language] = i18n.description;
    }
  }

  return NextResponse.json({ data: results });
});

const NewClientRequest = z.object({
  redirectUri: z.string().url().max(256), // Url to redirect back to
  name: z.record(z.string().length(2), z.string().max(64)),
  description: z.record(z.string().length(2), z.string()),
});

/** creates a new client */
export const POST = apiHandler(async (_req, { session }) => {
  if (!hasFeatureFlag(FeatureFlags.OAUTH_ENABLED)) {
    throw createHttpError.InternalServerError("OAuth 2.0 not enabled");
  }

  if (!session) {
    throw new createHttpError.Unauthorized("Must be logged in!");
  }

  const body = await _req.json();
  const newClient = NewClientRequest.parse(body);

  // Maximum client ID length

  const clientId = nanoid(64);

  const t = await db.sequelize?.transaction();

  if (!t) {
    throw createHttpError.InternalServerError("Can't start a transaction");
  }

  let created: OAuthClient;
  const i18nCreated: Record<string, OAuthClientI18N> = {};

  const names: LangMap = {};
  const descriptions: LangMap = {};

  try {
    created = await OAuthClient.create(
      {
        clientId,
        redirectURI: newClient.redirectUri,
      },
      { transaction: t },
    );

    for (const [language, name] of Object.entries(newClient.name)) {
      const description = newClient.description[language] || undefined;
      i18nCreated[language] = await OAuthClientI18N.create(
        {
          clientId,
          language,
          name,
          description,
        },
        { transaction: t },
      );
      names[language] = i18nCreated[language].name;
      if (i18nCreated[language].description) {
        descriptions[language] = i18nCreated[language].description;
      }
    }
    await t?.commit();
  } catch (error) {
    await t?.rollback();
    throw error;
  }

  const results: Client = {
    clientId,
    redirectUri: created.redirectURI,
    name: names,
    description: descriptions,
  };

  const locationUrl = `${_req.nextUrl.origin}/api/v0/client/${clientId}`;
  return NextResponse.json(
    { data: results },
    { status: 201, headers: { Location: locationUrl } },
  );
});
