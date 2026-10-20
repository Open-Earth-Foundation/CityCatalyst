import createHttpError from "http-errors";
import { NextResponse } from "next/server";
import { z } from "zod";

import { loadConceptNoteRunCity } from "@/backend/ConceptNoteUploadService";
import {
  callAuthorizedConceptNoteApi,
  readConceptNoteApiPayload,
} from "@/backend/concept-notes";
import type { AppSession } from "@/lib/auth";

const publicErrorSchema = z.object({
  code: z.string(),
  message: z.string().optional().catch(undefined),
});

/**
 * Forward a run-scoped request to Climate Advisor after checking that the
 * caller can access the run's city. Error responses expose only the public
 * code/message contract, excluding internal URLs and exception metadata.
 */
export async function proxyConceptNoteRunRequest(
  req: Request,
  session: AppSession | null,
  {
    runId,
    path,
    method = "GET",
    body,
    searchParams,
  }: {
    runId: string;
    path: string;
    method?: "GET" | "POST" | "DELETE";
    body?: Record<string, unknown>;
    searchParams?: Record<string, string>;
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
    searchParams: { ...searchParams, user_id: userId },
  });
  if (response.status === 204) {
    return new NextResponse(null, { status: 204 });
  }
  const payload = await readConceptNoteApiPayload(response);
  if (!response.ok) {
    const error = z.object({ detail: publicErrorSchema }).safeParse(payload);
    return NextResponse.json(
      { detail: error.success ? error.data.detail : "" },
      { status: response.status },
    );
  }
  return NextResponse.json(payload, {
    status: response.status,
  });
}
