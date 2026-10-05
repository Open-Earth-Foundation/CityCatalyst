import createHttpError from "http-errors";
import { NextResponse } from "next/server";

import { loadConceptNoteRunCity } from "@/backend/ConceptNoteUploadService";
import {
  callAuthorizedConceptNoteApi,
  readConceptNoteApiPayload,
} from "@/backend/concept-notes";
import type { AppSession } from "@/lib/auth";

/**
 * Forward a run-scoped request to Climate Advisor after checking that the
 * caller can access the run's city. Keeps the upstream status and JSON body so
 * the browser can map structured error codes.
 */
export async function proxyConceptNoteRunRequest(
  req: Request,
  session: AppSession | null,
  {
    runId,
    path,
    method = "GET",
    body,
  }: {
    runId: string;
    path: string;
    method?: "GET" | "POST" | "DELETE";
    body?: Record<string, unknown>;
  },
): Promise<NextResponse> {
  if (!session?.user?.id) {
    throw new createHttpError.Unauthorized("Authentication required");
  }
  const userId = session.user.id;
  const requestId = req.headers.get("x-request-id")?.trim() || undefined;
  const cityId = await loadConceptNoteRunCity({ runId, userId, requestId });
  const response = await callAuthorizedConceptNoteApi({
    cityId,
    session,
    path,
    method,
    body,
    requestId,
    searchParams: { user_id: userId },
  });
  if (response.status === 204) {
    return new NextResponse(null, { status: 204 });
  }
  return NextResponse.json(await readConceptNoteApiPayload(response), {
    status: response.status,
  });
}
