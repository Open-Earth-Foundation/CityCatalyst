import createHttpError from "http-errors";
import { NextResponse } from "next/server";
import { z } from "zod";

import { loadConceptNoteRunCity } from "@/backend/ConceptNoteUploadService";
import {
  callConceptNoteApi,
  readConceptNoteApiPayload,
} from "@/backend/concept-notes";
import { PermissionService } from "@/backend/permissions/PermissionService";
import type { AppSession } from "@/lib/auth";
import {
  editApplyRequestSchema,
  editProposalRequestSchema,
} from "@/util/concept-note-edit-types";

type EditProxyOperation =
  "list" | "propose" | "read" | "apply" | "reject" | "refine";
type EditProxyContext = {
  session: AppSession | null;
  params: Record<string, string>;
};

/** Authorize every run-scoped edit operation and preserve the CA status/body. */
export async function forwardConceptNoteEdit(
  request: Request,
  { session, params }: EditProxyContext,
  operation: EditProxyOperation,
): Promise<NextResponse> {
  if (!session?.user?.id) {
    throw new createHttpError.Unauthorized("Authentication required");
  }
  const runId = z.string().uuid().parse(params.runId);
  const needsTarget = !["list", "propose"].includes(operation);
  const targetId = needsTarget
    ? z.string().uuid().parse(params.proposalId)
    : null;
  const body = ["propose", "refine"].includes(operation)
    ? editProposalRequestSchema.parse(await request.json())
    : operation === "apply"
      ? editApplyRequestSchema.parse(await request.json())
      : undefined;
  const userId = session.user.id;
  const requestId = request.headers.get("x-request-id")?.trim() || undefined;
  const cityId = await loadConceptNoteRunCity({ runId, userId, requestId });
  await PermissionService.canAccessCity(session, cityId, {
    includeResource: false,
  });

  const suffix = targetId
    ? `/${targetId}${operation === "read" ? "" : `/${operation}`}`
    : "";
  const searchParams: Record<string, string> = { user_id: userId };
  const response = await callConceptNoteApi({
    path: `/v1/concept-notes/${runId}/edit-proposals${suffix}`,
    method: ["list", "read"].includes(operation) ? "GET" : "POST",
    body,
    userId,
    requestId,
    searchParams,
  });
  return NextResponse.json(await readConceptNoteApiPayload(response), {
    status: response.status,
  });
}
