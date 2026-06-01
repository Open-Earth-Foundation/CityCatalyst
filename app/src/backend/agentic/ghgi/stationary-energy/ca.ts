type TokenResponse = {
  access_token: string;
  expires_in: number;
  token_type: string;
};

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is not configured`);
  }
  return value;
}

export async function issueCaUserToken(params: {
  origin: string;
  userId: string;
  inventoryId?: string;
}): Promise<TokenResponse> {
  const serviceKey = requireEnv("CC_SERVICE_API_KEY");
  const response = await fetch(`${params.origin}/api/v1/internal/ca/user-token`, {
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

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `CA token issuance failed: ${response.status} - ${errorText}`,
    );
  }

  return response.json();
}

export async function callClimateAdvisorJson<T>(params: {
  origin: string;
  path: string;
  userId: string;
  inventoryId?: string;
  method?: "GET" | "POST";
  body?: Record<string, unknown>;
}): Promise<T> {
  const token = await issueCaUserToken({
    origin: params.origin,
    userId: params.userId,
    inventoryId: params.inventoryId,
  });
  const caBaseUrl = requireEnv("CA_BASE_URL");
  const response = await fetch(`${caBaseUrl}${params.path}`, {
    method: params.method ?? "GET",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token.access_token}`,
    },
    body: params.body ? JSON.stringify(params.body) : undefined,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Climate Advisor request failed: ${response.status} - ${errorText}`,
    );
  }

  return response.json() as Promise<T>;
}
