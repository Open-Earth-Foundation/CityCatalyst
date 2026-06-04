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
    throw new Error(`${name} is not configured`);
  }
  return value;
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
  origin: string;
  userId: string;
  inventoryId?: string;
}): Promise<TokenResponse> {
  const serviceKey = requireEnv("CC_SERVICE_API_KEY");
  const response = await fetch(
    `${params.origin}/api/v1/internal/ca/user-token`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-CA-Service-Key": serviceKey,
      },
      body: JSON.stringify({
        user_id: params.userId,
        inventory_id: params.inventoryId,
      }),
    },
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `CA token issuance failed: ${response.status} - ${errorText}`,
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

  return fetch(buildClimateAdvisorUrl(params.path, params.searchParams), {
    method: params.method ?? "GET",
    headers,
    body: params.body ? JSON.stringify(params.body) : undefined,
  });
}

/**
 * Read a CA response body as JSON when possible and fall back to plain text.
 */
export async function readClimateAdvisorResponsePayload(
  response: Response,
): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text);
  } catch {
    return { detail: text };
  }
}

/**
 * Create a CA thread after issuing a user-scoped access token.
 */
export async function createClimateAdvisorThread(params: {
  origin: string;
  userId: string;
  inventoryId?: string;
}): Promise<ThreadCreateResponse> {
  const token = await issueClimateAdvisorUserToken({
    origin: params.origin,
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
    const errorText = await response.text();
    throw new Error(`CA service error: ${response.status} - ${errorText}`);
  }

  return response.json() as Promise<ThreadCreateResponse>;
}
