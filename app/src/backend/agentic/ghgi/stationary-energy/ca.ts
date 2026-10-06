import createHttpError from "http-errors";

import {
  joinServiceUrl,
  requireServiceEnv,
} from "@/backend/climate-advisor-connection";

import { issueClimateAdvisorUserToken } from "@/backend/climate-advisor-token";

/**
 * Read a required Climate Advisor proxy environment variable.
 */
function requireEnv(name: string): string {
  return requireServiceEnv(name);
}

/**
 * Generate a CityCatalyst-scoped request id for CA correlation.
 */
function createClimateAdvisorRequestId(): string {
  return `cc-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

/**
 * Read the incoming CityCatalyst request id for CA correlation.
 */
export function getClimateAdvisorRequestId(req: Request): string | undefined {
  return req.headers.get("x-request-id")?.trim() || undefined;
}

export async function callClimateAdvisor(params: {
  path: string;
  tokenUserID: string;
  inventoryId?: string;
  method?: "GET" | "POST";
  body?: Record<string, unknown>;
  requestId?: string;
}): Promise<Response> {
  const token = await issueClimateAdvisorUserToken({
    userId: params.tokenUserID,
    inventoryId: params.inventoryId,
  });
  const caBaseUrl = requireEnv("CA_BASE_URL");
  try {
    return await fetch(joinServiceUrl(caBaseUrl, params.path), {
      method: params.method ?? "GET",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token.access_token}`,
        "X-Request-ID": params.requestId ?? createClimateAdvisorRequestId(),
      },
      body: params.body ? JSON.stringify(params.body) : undefined,
    });
  } catch (error) {
    throw new createHttpError.BadGateway(
      error instanceof Error ? error.message : "Climate Advisor request failed",
    );
  }
}
