import { createHash } from "node:crypto";
import createHttpError from "http-errors";

import {
  type ClimateAdvisorTokenResponse,
  joinServiceUrl,
  readClimateAdvisorTokenResponse,
  requireServiceEnv,
} from "@/backend/climate-advisor-connection";
import { logger } from "@/services/logger";

const EXPIRY_MARGIN_MS = 60_000;
const MAX_CACHED_TOKENS = 1_000;
const ATTEMPT_TIMEOUT_MS = 3_000;
const MAX_ATTEMPTS = 3;
const TRANSIENT_STATUSES = new Set([502, 503, 504]);
const STATE_KEY = Symbol.for("citycatalyst.ca-user-token-cache.v1");

type TokenParams = { userId: string; inventoryId?: string };
type CachedToken = { accessToken: string; expiresAt: number };
type TokenState = {
  fingerprint: string;
  tokens: Map<string, CachedToken>;
  inFlight: Map<string, Promise<CachedToken>>;
};
const processState = globalThis as typeof globalThis & {
  [STATE_KEY]?: TokenState;
};

/** Keep only safe failure metadata; upstream bodies and errors may contain secrets. */
class TokenIssuanceFailure extends Error {
  constructor(
    readonly status: number,
    readonly retryable: boolean,
    readonly category: "http" | "transport" | "timeout" | "invalid_response",
  ) {
    super(
      category === "invalid_response"
        ? "Invalid CA token response"
        : "Unable to obtain Climate Advisor access token",
    );
  }
}

/** Share state across Next.js route bundles, replacing it after credential rotation. */
function getState(host: string, serviceKey: string): TokenState {
  const fingerprint = createHash("sha256")
    .update(
      JSON.stringify([host, serviceKey, process.env.VERIFICATION_TOKEN_SECRET]),
    )
    .digest("hex");
  if (processState[STATE_KEY]?.fingerprint !== fingerprint) {
    processState[STATE_KEY] = {
      fingerprint,
      tokens: new Map(),
      inFlight: new Map(),
    };
  }
  return processState[STATE_KEY];
}

/** Bound the entire attempt, including reading a stalled response body. */
async function fetchToken(
  host: string,
  serviceKey: string,
  params: TokenParams,
): Promise<CachedToken> {
  const controller = new AbortController();
  const startedAt = Date.now();
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      (async () => {
        const response = await fetch(
          joinServiceUrl(host, "/api/v1/internal/ca/user-token/"),
          {
            method: "POST",
            cache: "no-store",
            signal: controller.signal,
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
          void response.body?.cancel().catch(() => {});
          throw new TokenIssuanceFailure(
            response.status,
            TRANSIENT_STATUSES.has(response.status),
            "http",
          );
        }

        // Read transport bytes separately so a broken stream is retryable, whereas
        // a complete but malformed JSON/token payload is not.
        const body = await response.text();
        let token: ClimateAdvisorTokenResponse;
        try {
          token = await readClimateAdvisorTokenResponse(new Response(body));
        } catch {
          throw new TokenIssuanceFailure(502, false, "invalid_response");
        }
        // Start before the request to avoid overstating the issuer's lifetime.
        const expiresAt = startedAt + token.expires_in * 1_000;
        if (!Number.isFinite(expiresAt) || expiresAt - Date.now() < 1_000) {
          throw new TokenIssuanceFailure(502, false, "invalid_response");
        }
        return { accessToken: token.access_token, expiresAt };
      })(),
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => {
          controller.abort();
          reject(new TokenIssuanceFailure(504, true, "timeout"));
        }, ATTEMPT_TIMEOUT_MS);
      }),
    ]);
  } catch (error) {
    if (controller.signal.aborted) {
      throw new TokenIssuanceFailure(504, true, "timeout");
    }
    if (error instanceof TokenIssuanceFailure) throw error;
    throw new TokenIssuanceFailure(502, true, "transport");
  } finally {
    clearTimeout(timeout);
  }
}

/** Retry only issuance, keeping the full retry sequence inside the shared promise. */
async function issueWithRetry(
  host: string,
  serviceKey: string,
  params: TokenParams,
): Promise<CachedToken> {
  const startedAt = Date.now();
  for (let attempt = 1; ; attempt++) {
    try {
      const token = await fetchToken(host, serviceKey, params);
      logger.debug(
        { attempt, duration_ms: Date.now() - startedAt },
        "CA user token issued",
      );
      return token;
    } catch (error) {
      const failure = error as TokenIssuanceFailure;
      const retrying = failure.retryable && attempt < MAX_ATTEMPTS;
      logger.warn(
        {
          attempt,
          status: failure.status,
          category: failure.category,
          duration_ms: Date.now() - startedAt,
          retrying,
        },
        "CA user token issuance failed",
      );
      if (!retrying) {
        throw createHttpError(failure.status, failure.message, {
          expose: true,
        });
      }
      const delay = 200 * 2 ** (attempt - 1) + Math.floor(Math.random() * 101);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}

/** Reuse a user-scoped token; inventory is request context, not JWT permission scope. */
export async function issueClimateAdvisorUserToken(
  params: TokenParams,
): Promise<ClimateAdvisorTokenResponse> {
  const host = requireServiceEnv("HOST");
  const serviceKey = requireServiceEnv("CC_SERVICE_API_KEY");
  const state = getState(host, serviceKey);
  let token = state.tokens.get(params.userId);
  state.tokens.delete(params.userId);
  if (token && token.expiresAt > Date.now() + EXPIRY_MARGIN_MS) {
    state.tokens.set(params.userId, token); // Most recently used.
  } else {
    let pending = state.inFlight.get(params.userId);
    if (!pending) {
      pending = issueWithRetry(host, serviceKey, params)
        .then((issued) => {
          // A request started before rotation must not populate the new cache.
          if (processState[STATE_KEY] === state) {
            for (const [userId, cached] of state.tokens) {
              if (cached.expiresAt <= Date.now() + EXPIRY_MARGIN_MS) {
                state.tokens.delete(userId);
              }
            }
            if (issued.expiresAt > Date.now() + EXPIRY_MARGIN_MS) {
              state.tokens.set(params.userId, issued);
              while (state.tokens.size > MAX_CACHED_TOKENS) {
                state.tokens.delete(state.tokens.keys().next().value!);
              }
            }
          }
          return issued;
        })
        .finally(() => state.inFlight.delete(params.userId));
      state.inFlight.set(params.userId, pending);
    }
    token = await pending;
  }
  const expiresIn = Math.floor((token.expiresAt - Date.now()) / 1_000);
  if (expiresIn <= 0) {
    throw createHttpError(
      502,
      "Unable to obtain Climate Advisor access token",
      {
        expose: true,
      },
    );
  }
  return {
    access_token: token.accessToken,
    expires_in: expiresIn,
    token_type: "Bearer",
  };
}
