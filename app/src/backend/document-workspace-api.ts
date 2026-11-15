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
import { FeatureFlags, hasServerFeatureFlag } from "@/util/feature-flags";

type WorkspaceOperation =
  "workspace" | "setup" | "commands" | "question" | "exports";
type WorkspaceContext = {
  session: AppSession | null;
  params: Record<string, string>;
};

const version = z.number().int().nonnegative();
const pointKey = z
  .string()
  .min(1)
  .max(255)
  .regex(/^[A-Za-z0-9_.:-]+$/);
const setupRequest = z
  .object({
    expected_revision: version,
    idempotency_key: z.string().uuid(),
    document_type: z.literal("concept_note").default("concept_note"),
  })
  .strict();
const commandRequest = z
  .object({
    command: z.enum([
      "answer",
      "confirm_candidate",
      "correct",
      "park",
      "resume",
      "assume",
      "not_applicable",
      "dismiss_candidate",
    ]),
    expected_version: version,
    idempotency_key: z.string().uuid(),
    value: z.unknown().optional(),
    candidate_id: z.string().uuid().optional(),
    reason: z.string().trim().min(1).max(4000).optional(),
    waiting_for: z.string().trim().max(255).optional(),
    requested_information: z.string().trim().max(4000).optional(),
    note: z.string().trim().max(4000).optional(),
  })
  .strict()
  .refine((value) => JSON.stringify(value.value ?? null).length <= 16000, {
    message: "Point answer is too large",
  });
const questionRequest = z
  .object({
    language: z
      .string()
      .regex(/^[a-z]{2}(?:-[A-Za-z]{2})?$/)
      .default("en"),
  })
  .strict();
const exportRequest = z
  .object({
    mode: z.enum(["working", "final"]),
    expected_revision: version,
  })
  .strict();

/** Authorize a document operation before forwarding its validated command. */
export async function forwardDocumentWorkspace(
  request: Request,
  { session, params }: WorkspaceContext,
  operation: WorkspaceOperation,
): Promise<NextResponse> {
  if (!session?.user?.id) {
    throw new createHttpError.Unauthorized("Authentication required");
  }
  if (
    !hasServerFeatureFlag(FeatureFlags.CONCEPT_NOTE_BUILDER) ||
    !hasServerFeatureFlag(FeatureFlags.CA_SERVICE_INTEGRATION)
  ) {
    throw new createHttpError.NotFound("Document workspace is unavailable");
  }
  const runId = z.string().uuid().parse(params.runId);
  const key =
    operation === "commands" || operation === "question"
      ? pointKey.parse(params.pointKey)
      : null;
  const userId = session.user.id;
  const requestId = request.headers.get("x-request-id")?.trim() || undefined;
  const cityId = await loadConceptNoteRunCity({ runId, userId, requestId });
  await PermissionService.canAccessCity(session, cityId, {
    includeResource: false,
    requireActive: operation !== "workspace" && operation !== "question",
  });

  let body: Record<string, unknown> | undefined;
  if (operation !== "workspace") {
    const input: unknown = await request.json();
    body =
      operation === "setup"
        ? setupRequest.parse(input)
        : operation === "commands"
          ? commandRequest.parse(input)
          : operation === "question"
            ? questionRequest.parse(input)
            : exportRequest.parse(input);
  }
  const suffix = key
    ? `points/${encodeURIComponent(key)}/${operation}`
    : operation;
  const response = await callConceptNoteApi({
    path: `/v1/concept-notes/${runId}/${suffix}`,
    method:
      operation === "workspace"
        ? "GET"
        : operation === "setup"
          ? "PUT"
          : "POST",
    body,
    userId,
    requestId,
    searchParams: { user_id: userId },
    signal: request.signal,
  });
  return NextResponse.json(await readConceptNoteApiPayload(response), {
    status: response.status,
  });
}
