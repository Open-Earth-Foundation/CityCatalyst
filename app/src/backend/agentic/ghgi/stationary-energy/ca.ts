import createHttpError from "http-errors";

type TokenResponse = {
  access_token: string;
  expires_in: number;
  token_type: string;
};

/**
 * Read a required Climate Advisor proxy environment variable.
 */
function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new createHttpError.InternalServerError(
      `${name} is not configured`,
    );
  }
  return value;
}

/**
 * Extract the most useful error message from a Climate Advisor JSON payload.
 */
function climateAdvisorErrorMessage(
  payload: unknown,
  fallback: string,
): string {
  if (payload && typeof payload === "object") {
    const problem = payload as Record<string, unknown>;
    if (typeof problem.detail === "string" && problem.detail.trim()) {
      return problem.detail;
    }
    if (typeof problem.title === "string" && problem.title.trim()) {
      return problem.title;
    }
    const error = problem.error;
    if (error && typeof error === "object") {
      const message = (error as Record<string, unknown>).message;
      if (typeof message === "string" && message.trim()) {
        return message;
      }
    }
  }

  return fallback;
}

/**
 * Read a CA error payload as JSON when available.
 */
async function readClimateAdvisorErrorPayload(
  response: Response,
): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

/**
 * Re-throw a CA proxy failure with the upstream HTTP status and payload.
 */
async function throwClimateAdvisorProxyError(
  response: Response,
  fallback: string,
): Promise<never> {
  const payload = await readClimateAdvisorErrorPayload(response);
  throw createHttpError(
    response.status,
    climateAdvisorErrorMessage(payload, fallback),
    payload ? { data: payload } : undefined,
  );
}

export async function issueCaUserToken(params: {
  origin: string;
  tokenUserID: string;
  inventoryId?: string;
}): Promise<TokenResponse> {
  const serviceKey = requireEnv("CC_SERVICE_API_KEY");
  let response: Response;
  try {
    response = await fetch(`${params.origin}/api/v1/internal/ca/user-token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-CA-Service-Key": serviceKey,
      },
      body: JSON.stringify({
        user_id: params.tokenUserID,
        inventory_id: params.inventoryId,
      }),
    });
  } catch (error) {
    throw new createHttpError.BadGateway(
      error instanceof Error
        ? error.message
        : "CA token issuance request failed",
    );
  }

  if (!response.ok) {
    await throwClimateAdvisorProxyError(response, "CA token issuance failed");
  }

  return response.json();
}

export async function callClimateAdvisor(params: {
  origin: string;
  path: string;
  tokenUserID: string;
  inventoryId?: string;
  method?: "GET" | "POST";
  body?: Record<string, unknown>;
}): Promise<Response> {
  const token = await issueCaUserToken({
    origin: params.origin,
    tokenUserID: params.tokenUserID,
    inventoryId: params.inventoryId,
  });
  const caBaseUrl = requireEnv("CA_BASE_URL");
  try {
    return await fetch(`${caBaseUrl}${params.path}`, {
      method: params.method ?? "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token.access_token}`,
      },
      body: params.body ? JSON.stringify(params.body) : undefined,
    });
  } catch (error) {
    throw new createHttpError.BadGateway(
      error instanceof Error ? error.message : "Climate Advisor request failed",
    );
  }
}
