import { Roles } from "@/util/types";
import { db } from "@/models";
import { apiHandler } from "@/util/api";
import createHttpError from "http-errors";
import { NextResponse } from "next/server";
import { z } from "zod";

const TOKEN_EXPIRY = 24 * 60 * 60;

/**  */
export const POST = apiHandler(async (_req, { params, session }) => {

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

  // XXX: validate inputs

  const accessToken = "fake_token";
  const refreshToken = "fake_refresh_token";
  const scope = "read write";

  return NextResponse.json({
    access_token: accessToken,
    token_type: "Bearer",
    expires_in: TOKEN_EXPIRY,
    refresh_token: refreshToken,
    scope
  });
})
