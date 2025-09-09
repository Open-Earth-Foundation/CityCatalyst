import { apiHandler } from "@/util/api";
import createHttpError from "http-errors";
import { NextResponse } from "next/server";
import { hasFeatureFlag, FeatureFlags } from "@/util/feature-flags";

/** Return client authorization information for this user */

export const GET = apiHandler(async (_req, { params, session }) => {
  if (!hasFeatureFlag(FeatureFlags.OAUTH_ENABLED)) {
    throw createHttpError.InternalServerError("OAuth 2.0 not enabled");
  }

  if (!session) {
    throw new createHttpError.Unauthorized(
      "Not signed in as the requested user",
    );
  }

  throw new createHttpError.NotImplemented('Not yet implemented')
})

export const DELETE = apiHandler(async (_req, { params, session }) => {
  if (!hasFeatureFlag(FeatureFlags.OAUTH_ENABLED)) {
    throw createHttpError.InternalServerError("OAuth 2.0 not enabled");
  }

  if (!session) {
    throw new createHttpError.Unauthorized(
      "Not signed in as the requested user",
    );
  }

  throw new createHttpError.NotImplemented('Not yet implemented')
})
