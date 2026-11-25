import createHttpError from "http-errors";

import {
  joinServiceUrl,
  requireServiceEnv,
} from "@/backend/climate-advisor-connection";

import { issueClimateAdvisorUserToken } from "@/backend/climate-advisor-token";
import { logger } from "@/services/logger";

type QueryValue = string | number | boolean | null | undefined;

type ClimateAdvisorRequest = {
  signal?: AbortSignal;
  path: string;
  method?: "GET" | "HEAD" | "POST" | "PUT" | "PATCH" | "DELETE";
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
  return requireServiceEnv(name);
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
  const url = new URL(joinServiceUrl(requireEnv("CA_BASE_URL"), path));

  for (const [key, value] of Object.entries(searchParams ?? {})) {
    if (value === null || value === undefined || value === "") {
      continue;
    }
    url.searchParams.set(key, String(value));
  }

  return url.toString();
}

const READ_ATTEMPT_TIMEOUT_MS = 5_000;
const READ_TOTAL_TIMEOUT_MS = 16_000;
const READ_RETRY_DELAYS_MS = [200, 600];
const READ_RETRY_CAUSE_CODES = [
  "ECONNRESET",
  "ECONNREFUSED",
  "ETIMEDOUT",
  "UND_ERR_SOCKET",
  "UND_ERR_CONNECT_TIMEOUT",
  "UND_ERR_HEADERS_TIMEOUT",
  "UND_ERR_BODY_TIMEOUT",
];

function fetchErrorDetails(error: unknown) {
  const cause: unknown =
    error instanceof Error ? (error.cause ?? error) : error;
  return {
    error_name: error instanceof Error ? error.name : undefined,
    cause_code:
      cause &&
      typeof cause === "object" &&
      "code" in cause &&
      typeof cause.code === "string"
        ? cause.code
        : undefined,
  };
}

function waitForReadRetry(delay: number, signal: AbortSignal): Promise<void> {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", abort);
      resolve();
    }, delay);
    function abort() {
      clearTimeout(timer);
      reject(signal.reason);
    }
    signal.addEventListener("abort", abort, { once: true });
  });
}

async function fetchClimateAdvisorRead(
  url: string,
  init: RequestInit,
  path: string,
): Promise<Response> {
  const deadline = AbortSignal.timeout(READ_TOTAL_TIMEOUT_MS);
  const signal = init.signal
    ? AbortSignal.any([init.signal, deadline])
    : deadline;

  for (let attempt = 0; ; attempt++) {
    signal.throwIfAborted();
    const attemptTimeout = AbortSignal.timeout(READ_ATTEMPT_TIMEOUT_MS);
    try {
      return await fetch(url, {
        ...init,
        signal: AbortSignal.any([signal, attemptTimeout]),
      });
    } catch (error) {
      signal.throwIfAborted();
      const delay = READ_RETRY_DELAYS_MS[attempt];
      const details = fetchErrorDetails(error);
      if (
        delay === undefined ||
        (!attemptTimeout.aborted &&
          details.error_name !== "TimeoutError" &&
          !READ_RETRY_CAUSE_CODES.includes(details.cause_code ?? ""))
      ) {
        throw error;
      }

      await waitForReadRetry(delay, signal);
      signal.throwIfAborted();
      logger.warn(
        {
          method: init.method,
          path,
          ...details,
          next_attempt: attempt + 2,
          delay_ms: delay,
        },
        "Retrying Climate Advisor request",
      );
    }
  }
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

  const method = params.method ?? "GET";
  const path = params.path.split(/[?#]/, 1)[0];
  try {
    const url = buildClimateAdvisorUrl(params.path, params.searchParams);
    const init: RequestInit = {
      method,
      ...(params.signal ? { signal: params.signal } : {}),
      headers,
      body: params.body ? JSON.stringify(params.body) : undefined,
    };
    const acceptsSse = headers
      .get("Accept")
      ?.split(",")
      .some(
        (value) =>
          value.split(";", 1)[0].trim().toLowerCase() === "text/event-stream",
      );
    if ((method === "GET" || method === "HEAD") && !acceptsSse) {
      return await fetchClimateAdvisorRead(url, init, path);
    }
    return await fetch(url, init);
  } catch (error) {
    logger.warn(
      { method, path, ...fetchErrorDetails(error) },
      "Climate Advisor request failed",
    );
    throw createHttpError(
      502,
      error instanceof Error ? error.message : "Climate Advisor request failed",
      { cause: error },
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
    headers: {
      Authorization: `Bearer ${token.access_token}`,
    },
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
