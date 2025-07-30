import { apiHandler } from "@/util/api";
import createHttpError from "http-errors";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getClient } from "@/util/client";
import jwt from "jsonwebtoken";
import { logger } from "@/services/logger";
import { createHash } from "node:crypto";
import { hasFeatureFlag, FeatureFlags } from "@/util/feature-flags";
import TTLCache from "@isaacs/ttlcache";

// 10-minute cache, for checking jwtid replay

const cache = new TTLCache({ max: 10000, ttl: 10 * 60 * 1000 })

const ACCESS_TOKEN_EXPIRY = 7 * 24 * 60 * 60;
const REFRESH_TOKEN_EXPIRY = 30 * 24 * 60 * 60;

function verifyPKCE(verifier: string, challenge: string): boolean {
  const hash = createHash("sha256").update(verifier, "ascii").digest();
  const base64url = hash
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  return base64url === challenge;
}

/**  */
export const POST = apiHandler(async (_req, { params, session }) => {

  if (!hasFeatureFlag(FeatureFlags.OAUTH_ENABLED)) {
    throw createHttpError.InternalServerError("OAuth 2.0 not enabled");
  }

  if (!process.env.VERIFICATION_TOKEN_SECRET) {
    logger.error("Need to assign VERIFICATION_TOKEN_SECRET in env!");
    throw createHttpError.InternalServerError("Configuration error");
  }

  const contentType = _req.headers.get('content-type') || ''

  if (!contentType.includes('application/x-www-form-urlencoded')) {
    return NextResponse.json(
      { error: 'unsupported_content_type' },
      { status: 415 }
    )
  }

  const formData = await _req.formData()

  const grantType = formData.get("grant_type");
  const code = formData.get("code");
  const redirectUri = formData.get("redirect_uri");
  const clientId = formData.get("client_id");
  const codeVerifier = formData.get("code_verifier");

  if (grantType == null) {
    throw new createHttpError.BadRequest("grant_type is required")
  }

  if (typeof grantType !== 'string') {
    throw new createHttpError.BadRequest("grant_type must be a string")
  }

  if (grantType !== "authorization_code") {
    throw new createHttpError.BadRequest("grant_type must 'authorization_code'")
  }

  if (code == null) {
    throw new createHttpError.BadRequest("code is required")
  }

  if (typeof code !== 'string') {
    throw new createHttpError.BadRequest("code must be a string")
  }

  if (clientId == null) {
    throw new createHttpError.BadRequest("client_id is required")
  }

  if (typeof clientId !== 'string') {
    throw new createHttpError.BadRequest("client_id must be a string")
  }

  if (redirectUri == null) {
    throw new createHttpError.BadRequest("redirect_uri is required")
  }

  if (typeof redirectUri !== 'string') {
    throw new createHttpError.BadRequest("redirect_uri must be a string")
  }

  if (codeVerifier == null) {
    throw new createHttpError.BadRequest("code_verifier is required")
  }

  if (typeof codeVerifier !== 'string') {
    throw new createHttpError.BadRequest("code_verifier must be a string")
  }

  const client = await getClient(clientId);

  if (!client) {
    throw new createHttpError.BadRequest("Unrecognized client_id")
  }

  if (client.redirectUri !== redirectUri) {
    throw new createHttpError.BadRequest("redirect_uri mismatch")
  }

  let decoded: any;

  try {
    decoded = jwt.verify(
      code,
      process.env.VERIFICATION_TOKEN_SECRET
    )
  } catch (error: any) {
    if (error.name === "TokenExpiredError") {
      throw createHttpError.BadRequest("Code has expired.");
    } else {
      throw createHttpError.BadRequest("Invalid reset token.");
    }
  }

  const origin = (new URL(_req.url)).origin;

  if (decoded.iss !== origin) {
    throw createHttpError.BadRequest("code issued by a different server.");
  }

  if (decoded.aud !== origin) {
    throw createHttpError.BadRequest("code issued for a different server.");
  }

  if (decoded.client_id !== clientId) {
    throw createHttpError.BadRequest("client_id mismatch with code.");
  }

  if (decoded.redirect_uri !== redirectUri) {
    throw createHttpError.BadRequest("redirect_uri mismatch with code.");
  }

  const codeChallenge = decoded.code_challenge;

  if (!verifyPKCE(codeVerifier, codeChallenge)) {
    throw createHttpError.BadRequest("PKCE verification failed.");
  }

  if (cache.has(decoded.jwtid)) {
    throw createHttpError.BadRequest("Single-use code.");
  }

  cache.set(decoded.jwtid, true);

  const scope = decoded.scope;

  const accessToken = jwt.sign({
      client_id: clientId,
      scope
    },
    process.env.VERIFICATION_TOKEN_SECRET,
    {
      expiresIn: ACCESS_TOKEN_EXPIRY,
      issuer: origin,
      audience: origin,
      subject: decoded.sub
    }
  );

  const refreshToken = jwt.sign({
      client_id: clientId,
      scope
    },
    process.env.VERIFICATION_TOKEN_SECRET,
    {
      expiresIn: REFRESH_TOKEN_EXPIRY,
      issuer: origin,
      audience: origin,
      subject: decoded.sub
    }
  );

  return NextResponse.json({
    access_token: accessToken,
    token_type: "Bearer",
    expires_in: ACCESS_TOKEN_EXPIRY,
    refresh_token: refreshToken,
    scope
  });
})
