import { apiHandler } from "@/util/api";
import createHttpError from "http-errors";
import { NextResponse } from "next/server";
import { getClient } from "@/util/client";
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
