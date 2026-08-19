import { randomUUID } from "node:crypto";

import createHttpError from "http-errors";
import { NextResponse } from "next/server";
import { z } from "zod";

import {
  callClimateAdvisorChat,
  issueClimateAdvisorUserToken,
} from "@/backend/chat/climate-advisor";
import { PermissionService } from "@/backend/permissions/PermissionService";
import type { AppSession } from "@/lib/auth";

const upstreamRunSchema = z.object({ city_id: z.string().uuid() });

type ConceptNoteApiRequest = {
  path: string;
  userId: string;
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: Record<string, unknown>;
  headers?: HeadersInit;
  requestId?: string;
  searchParams?: Record<string, string>;
};

/**
 * Call an authenticated Concept Note Builder endpoint in Climate Advisor.
 */
export async function callConceptNoteApi(
  request: ConceptNoteApiRequest,
): Promise<Response> {
  const token = await issueClimateAdvisorUserToken({
    userId: request.userId,
  });

  return callClimateAdvisorChat({
    path: request.path,
    method: request.method,
    body: request.body,
    searchParams: request.searchParams,
    headers: {
      ...Object.fromEntries(new Headers(request.headers).entries()),
      Authorization: `Bearer ${token.access_token}`,
      "X-Request-ID": request.requestId ?? `cc-${randomUUID()}`,
    },
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

/** Preserve an upstream response after rechecking city access on success. */
export async function conceptNoteRunResponse(
  response: Response,
  session: AppSession,
): Promise<NextResponse> {
  const payload = await readConceptNoteApiPayload(response);
  if (response.ok) {
    const run = upstreamRunSchema.safeParse(payload);
    if (!run.success) {
      throw new createHttpError.BadGateway(
        "Climate Advisor returned an invalid concept-note run",
      );
    }
    await PermissionService.canAccessCity(session, run.data.city_id, {
      includeResource: false,
    });
  }
  return NextResponse.json(payload, { status: response.status });
}
