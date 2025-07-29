import { apiHandler } from "@/util/api";
import createHttpError from "http-errors";
import { NextResponse } from "next/server";
import { z } from "zod";
import jwt from "jsonwebtoken";
import { logger } from "@/services/logger";
import { v4 } from "uuid";
import { getClient } from "@/util/client";
import { Client, LangMap } from "@/util/types";

const CODE_EXPIRY = 5 * 60;

/** Return an authorization code */

  export const POST = apiHandler(async (_req, { params, session }) => {

  if (!process.env.VERIFICATION_TOKEN_SECRET) {
    logger.error("Need to assign VERIFICATION_TOKEN_SECRET in env!");
    throw createHttpError.InternalServerError("Configuration error");
  }

  if (!session) {
    throw new createHttpError.Unauthorized(
      "Not signed in as the requested user",
    );
  }

  const {
    clientId,
    redirectUri,
    codeChallenge,
    scope
  } = await _req.json();

  const client = await getClient(clientId);

  if (!client) {
    throw new createHttpError.BadRequest(
      `No such client: ${clientId}`
    );
  }

  if (client.redirectUri !== redirectUri) {
    throw new createHttpError.BadRequest(
      'Redirect URI mismatch'
    );
  }

  const origin = (new URL(_req.url)).origin;

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
