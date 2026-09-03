import { randomUUID } from "node:crypto";

import createHttpError from "http-errors";
import { NextResponse } from "next/server";
import { z } from "zod";

import {
  callClimateAdvisorChat,
  issueClimateAdvisorUserToken,
} from "@/backend/chat/climate-advisor";
import type { ClimateAdvisorTokenResponse } from "@/backend/climate-advisor-connection";
import { PermissionService } from "@/backend/permissions/PermissionService";
import type { AppSession } from "@/lib/auth";
import { logger } from "@/services/logger";

const upstreamRunSchema = z.object({ city_id: z.string().uuid() });
const tokenRefreshMarginMs = 60_000;
const tokenCacheMaxEntries = 1_000;

type CachedUserToken = {
  token: ClimateAdvisorTokenResponse;
  expiresAt: number;
};

const userTokenCache = new Map<string, CachedUserToken>();
const userTokenIssuance = new Map<
  string,
  Promise<ClimateAdvisorTokenResponse>
>();

type ConceptNoteApiRequest = {
  path: string;
  userId: string;
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: Record<string, unknown>;
  headers?: Record<string, string>;
  requestId?: string;
  searchParams?: Record<string, string>;
};

type AuthorizedConceptNoteApiRequest = Omit<ConceptNoteApiRequest, "userId"> & {
  cityId: string;
  session: AppSession;
};

/**
 * Call an authenticated Concept Note Builder endpoint in Climate Advisor.
 */
export async function callConceptNoteApi(
  request: ConceptNoteApiRequest,
): Promise<Response> {
  const token = await getConceptNoteUserToken(request.userId);

  return callClimateAdvisorChat({
    path: request.path,
    method: request.method,
    body: request.body,
    searchParams: request.searchParams,
    headers: {
      ...request.headers,
      Authorization: `Bearer ${token.access_token}`,
      "X-Request-ID": request.requestId ?? `cc-${randomUUID()}`,
    },
  });
}

/**
 * Reuse one valid CA token per user and coalesce concurrent token issuance.
 */
async function getConceptNoteUserToken(
  userId: string,
): Promise<ClimateAdvisorTokenResponse> {
  const now = Date.now();
  const cached = userTokenCache.get(userId);
  if (cached && cached.expiresAt > now) {
    userTokenCache.delete(userId);
    userTokenCache.set(userId, cached);
    return cached.token;
  }
  userTokenCache.delete(userId);

  const pending = userTokenIssuance.get(userId);
  if (pending) {
    return pending;
  }

  const issuance = issueClimateAdvisorUserToken({ userId }).then((token) => {
    cacheConceptNoteUserToken(userId, token);
    return token;
  });
  userTokenIssuance.set(userId, issuance);
  try {
    return await issuance;
  } finally {
    if (userTokenIssuance.get(userId) === issuance) {
      userTokenIssuance.delete(userId);
    }
  }
}

/** Retain a valid token until shortly before its reported expiry. */
function cacheConceptNoteUserToken(
  userId: string,
  token: ClimateAdvisorTokenResponse,
): void {
  const now = Date.now();
  const ttlMs = token.expires_in * 1_000 - tokenRefreshMarginMs;
  if (ttlMs <= 0) {
    return;
  }

  for (const [cachedUserId, cached] of userTokenCache) {
    if (cached.expiresAt <= now) {
      userTokenCache.delete(cachedUserId);
    }
  }
  userTokenCache.set(userId, { token, expiresAt: now + ttlMs });
  while (userTokenCache.size > tokenCacheMaxEntries) {
    const oldestUserId = userTokenCache.keys().next().value;
    if (oldestUserId === undefined) {
      break;
    }
    userTokenCache.delete(oldestUserId);
  }
}

/** Reset process-local token state between isolated unit tests. */
export function resetConceptNoteUserTokenCacheForTests(): void {
  userTokenCache.clear();
  userTokenIssuance.clear();
}

/** Check city access before calling an authenticated Concept Note endpoint. */
export async function callAuthorizedConceptNoteApi(
  request: AuthorizedConceptNoteApiRequest,
): Promise<Response> {
  const { cityId, session, ...apiRequest } = request;
  await PermissionService.canAccessCity(session, cityId, {
    includeResource: false,
  });
  return callConceptNoteApi({
    ...apiRequest,
    userId: session.user.id,
  });
}

/**
 * Read an upstream JSON response without exposing transport parsing details.
 */
export async function readConceptNoteApiPayload(
  response: Response,
): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    throw new createHttpError.BadGateway(
      "Climate Advisor returned an invalid response",
    );
  }
}

/** Preserve an upstream response after validating its successful run payload. */
export async function conceptNoteRunResponse(
  response: Response,
  expectedCityId: string,
): Promise<NextResponse> {
  const payload = await readConceptNoteApiPayload(response);
  if (response.ok) {
    const run = upstreamRunSchema.safeParse(payload);
    if (!run.success) {
      logger.error(
        { error: run.error },
        "Climate Advisor returned an invalid concept-note run",
      );
      throw new createHttpError.BadGateway(
        "Climate Advisor returned an invalid concept-note run",
      );
    }
    if (run.data.city_id.toLowerCase() !== expectedCityId.toLowerCase()) {
      throw new createHttpError.BadGateway(
        "Climate Advisor returned a concept-note run for an unexpected city",
      );
    }
  }
  return NextResponse.json(payload, { status: response.status });
}
