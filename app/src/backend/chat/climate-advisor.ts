import createHttpError from "http-errors";

type TokenResponse = {
  access_token: string;
  expires_in: number;
  token_type: string;
};

type QueryValue = string | number | boolean | null | undefined;

type ClimateAdvisorRequest = {
  path: string;
  method?: "GET" | "POST";
  body?: Record<string, unknown>;
  headers?: HeadersInit;
  searchParams?: Record<string, QueryValue>;
};

type ThreadCreateResponse = {
  thread_id: string;
  inventory_id?: string | null;
  context?: Record<string, unknown> | null;
};

/**
 * Read a required environment variable for CA proxy calls.
 */
function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new createHttpError.InternalServerError(`${name} is not configured`);
  }
  return value;
}

/**
 * Extract the most useful CA error message from a JSON problem payload.
 */
export function extractClimateAdvisorErrorMessage(
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
 * Build an HTTP error that preserves an upstream JSON payload when present.
 */
function createClimateAdvisorHttpError(
  status: number,
  payload: unknown,
  fallback: string,
) {
  const message = extractClimateAdvisorErrorMessage(payload, fallback);
  if (payload && typeof payload === "object") {
    return createHttpError(status, message, { data: payload });
  }
  return createHttpError(status, message);
}

/**
 * Build a Climate Advisor URL with optional query parameters.
 */
function buildClimateAdvisorUrl(
  path: string,
  searchParams?: Record<string, QueryValue>,
): string {
  const url = new URL(path, requireEnv("CA_BASE_URL"));

  for (const [key, value] of Object.entries(searchParams ?? {})) {
    if (value === null || value === undefined || value === "") {
      continue;
    }
    url.searchParams.set(key, String(value));
  }

  return url.toString();
}

/**
 * Issue a short-lived CA user token through the internal service endpoint.
 */
export async function issueClimateAdvisorUserToken(params: {
  userId: string;
  inventoryId?: string;
}): Promise<TokenResponse> {
  const serviceKey = requireEnv("CC_SERVICE_API_KEY");
  const host = requireEnv("HOST");
  let response: Response;
  try {
    response = await fetch(`${host}/api/v1/internal/ca/user-token/`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-CA-Service-Key": serviceKey,
      },
      body: JSON.stringify({
        user_id: params.userId,
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
    const payload = await readClimateAdvisorResponsePayload(response);
    throw createClimateAdvisorHttpError(
      response.status,
      payload,
      "CA token issuance failed",
    );
  }

  return response.json();
}

/**
 * Execute a direct request against the Climate Advisor API.
 */
export async function callClimateAdvisorChat(
  params: ClimateAdvisorRequest,
): Promise<Response> {
  const headers = new Headers(params.headers);
  if (params.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  try {
    return await fetch(
      buildClimateAdvisorUrl(params.path, params.searchParams),
      {
        method: params.method ?? "GET",
        headers,
        body: params.body ? JSON.stringify(params.body) : undefined,
      },
    );
  } catch (error) {
    throw new createHttpError.BadGateway(
      error instanceof Error ? error.message : "Climate Advisor request failed",
    );
  }
}

/**
 * Read a CA response body as JSON when possible and fall back to plain text.
 */
export async function readClimateAdvisorResponsePayload(
  response: Response,
): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return {};
  }
}

/**
 * Create a CA thread after issuing a user-scoped access token.
 */
export async function createClimateAdvisorThread(params: {
  userId: string;
  inventoryId?: string;
}): Promise<ThreadCreateResponse> {
  const token = await issueClimateAdvisorUserToken({
    userId: params.userId,
    inventoryId: params.inventoryId,
  });

  const response = await callClimateAdvisorChat({
    path: "/v1/threads",
    method: "POST",
    body: {
      user_id: params.userId,
      inventory_id: params.inventoryId,
      context: {
        access_token: token.access_token,
        expires_in: token.expires_in,
        token_type: token.token_type,
        issued_at: new Date().toISOString(),
      },
    },
  });

  if (!response.ok) {
    const payload = await readClimateAdvisorResponsePayload(response);
    throw createClimateAdvisorHttpError(
      response.status,
      payload,
      "CA service error",
    );
  }

  return response.json() as Promise<ThreadCreateResponse>;
}
