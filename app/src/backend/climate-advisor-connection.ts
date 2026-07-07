import createHttpError from "http-errors";

export type ClimateAdvisorTokenResponse = {
  access_token: string;
  expires_in: number;
  token_type: "Bearer";
};

const invalidTokenResponseError = () =>
  createHttpError(502, "Invalid CA token response", { expose: true });

/**
 * Join a service base URL and absolute API path without producing double slashes.
 */
export function joinServiceUrl(baseUrl: string, path: string): string {
  return new URL(
    path,
    baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`,
  ).toString();
}

/**
 * Read a required environment variable for CC/CA service calls.
 */
export function requireServiceEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new createHttpError.InternalServerError(`${name} is not configured`);
  }
  return value;
}

/**
 * Validate the token payload returned by the internal CityCatalyst token route.
 */
export async function readClimateAdvisorTokenResponse(
  response: Response,
): Promise<ClimateAdvisorTokenResponse> {
  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw invalidTokenResponseError();
  }

  if (!payload || typeof payload !== "object") {
    throw invalidTokenResponseError();
  }

  const token = payload as Record<string, unknown>;
  const accessToken = token.access_token;
  const tokenType = token.token_type;
  const expiresIn = token.expires_in;

  if (
    typeof accessToken !== "string" ||
    !accessToken.trim() ||
    tokenType !== "Bearer" ||
    typeof expiresIn !== "number" ||
    !Number.isFinite(expiresIn) ||
    expiresIn <= 0
  ) {
    throw invalidTokenResponseError();
  }

  return {
    access_token: accessToken,
    expires_in: expiresIn,
    token_type: "Bearer",
  };
}
