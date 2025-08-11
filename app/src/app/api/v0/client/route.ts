import { apiHandler } from "@/util/api";
import createHttpError from "http-errors";
import { NextResponse } from "next/server";
import { hasFeatureFlag, FeatureFlags } from "@/util/feature-flags";
import { OAuthClient } from "@/models/OAuthClient";
import { OAuthClientI18N } from "@/models/OAuthClientI18N";
import { Client } from "@/util/types";

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

  const results: Client[] = clients.map(cl => {
    return {
      clientId: cl.clientId,
      redirectUri: cl.redirectURI,
      name: {},
      description: {}
    }
  });

  for (const i18n of i18ns) {
    const cl = results.find(cl => cl.clientId == i18n.clientId)
    if (!cl) {
      throw createHttpError.InternalServerError(`No client with ID ${i18n.clientId}`);
    }
    if (i18n.name) {
      cl.name[i18n.language] = i18n.name
    }
    if (i18n.description) {
      cl.description[i18n.language] = i18n.description
    }
  }

  return NextResponse.json({ data: results });
})

/** creates a new client */
export const POST = apiHandler(async (_req, { session }) => {

  if (!hasFeatureFlag(FeatureFlags.OAUTH_ENABLED)) {
    throw createHttpError.InternalServerError("OAuth 2.0 not enabled");
  }

  if (!session) {
    throw new createHttpError.Unauthorized("Must be logged in!");
  }

  throw createHttpError.NotImplemented("Not yet implemented!");
});