import { apiHandler } from "@/util/api";
import createHttpError from "http-errors";
import { NextResponse } from "next/server";
import { z } from "zod";
import jwt from "jsonwebtoken";
import { logger } from "@/services/logger";
import { v4 } from "uuid";
import { OAuthClient } from "@/models/OAuthClient";
import { Client, LangMap } from "@/util/types";
import crypto from "node:crypto";
import { FeatureFlags, hasFeatureFlag } from "@/util/feature-flags";

const CODE_EXPIRY = 5 * 60;

/** Return an authorization code */

export const POST = apiHandler(async (_req, { params, session }) => {

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

  const {
    clientId,
    redirectUri,
    codeChallenge,
    scope,
    csrfToken
  } = await _req.json();

  if (csrfToken !== crypto.createHmac('sha256', csrfSecret).digest('hex')) {
    throw createHttpError.BadRequest("csrfToken does not match")
  }

  const client = await OAuthClient.findByPk(clientId);

  if (!client) {
    throw new createHttpError.BadRequest(
      `No such client: ${clientId}`
    );
  }

  if (client.redirectURI !== redirectUri) {
    throw new createHttpError.BadRequest(
      'Redirect URI mismatch'
    );
  }

  const origin = process.env.HOST || (new URL(_req.url)).origin;

  const code = jwt.sign(
    {
      client_id: clientId,
      redirect_uri: redirectUri,
      scope,
      code_challenge: codeChallenge
    },
    process.env.VERIFICATION_TOKEN_SECRET,
    {
      expiresIn: "5m",
      issuer: origin,
      audience: origin,
      subject: session.user.id,
      jwtid: v4()
    },
  );
  return NextResponse.json({
    data: {
      code
    }
  });
})
