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
  editHistoryRequestSchema,
  editProposalRequestSchema,
} from "@/util/concept-note-edit-types";

type EditProxyOperation =
  | "list"
  | "propose"
  | "read"
  | "apply"
  | "reject"
  | "refine"
  | "history"
  | "revision"
  | "undo"
  | "restore";
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
  const history = ["history", "revision", "undo", "restore"].includes(
    operation,
  );
  const needsTarget = !["list", "propose", "history"].includes(operation);
  const targetId = needsTarget
    ? z
        .string()
        .uuid()
        .parse(history ? params.revisionId : params.proposalId)
    : null;
  const body = ["propose", "refine"].includes(operation)
    ? editProposalRequestSchema.parse(await request.json())
    : operation === "apply"
      ? editApplyRequestSchema.parse(await request.json())
      : ["undo", "restore"].includes(operation)
        ? editHistoryRequestSchema.parse(await request.json())
        : undefined;
  const userId = session.user.id;
  const requestId = request.headers.get("x-request-id")?.trim() || undefined;
  const cityId = await loadConceptNoteRunCity({ runId, userId, requestId });
  await PermissionService.canAccessCity(session, cityId, {
    includeResource: false,
  });

  const suffix = targetId
    ? `/${targetId}${["read", "revision"].includes(operation) ? "" : `/${operation}`}`
    : "";
  const searchParams: Record<string, string> = { user_id: userId };
  const beforeSequence = new URL(request.url).searchParams.get(
    "before_sequence",
  );
  if (operation === "history" && beforeSequence !== null) {
    searchParams.before_sequence = String(
      z.coerce
        .number()
        .int()
        .positive()
        .max(2_147_483_647)
        .parse(beforeSequence),
    );
  }
  const response = await callConceptNoteApi({
    path: `/v1/concept-notes/${runId}/${history ? "revisions" : "edit-proposals"}${suffix}`,
    method: ["list", "read", "history", "revision"].includes(operation)
      ? "GET"
      : "POST",
    body,
    userId,
    requestId,
    searchParams,
  });
  return NextResponse.json(await readConceptNoteApiPayload(response), {
    status: response.status,
  });
}
