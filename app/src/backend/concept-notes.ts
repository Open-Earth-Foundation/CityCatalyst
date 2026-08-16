import { randomUUID } from "node:crypto";

import createHttpError from "http-errors";

import {
  callClimateAdvisorChat,
  issueClimateAdvisorUserToken,
} from "@/backend/chat/climate-advisor";

type ConceptNoteApiRequest = {
  path: string;
  userId: string;
  method?: "GET" | "POST";
  body?: Record<string, unknown>;
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
