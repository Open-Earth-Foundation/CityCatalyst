import createHttpError from "http-errors";
import { z } from "zod";

import {
  callConceptNoteApi,
  readConceptNoteApiPayload,
} from "@/backend/concept-notes";

const runSchema = z.object({
  city_id: z.string().uuid(),
});

export const conceptNoteUploadSchema = z.object({
  upload_id: z.string().uuid(),
  run_id: z.string().uuid(),
  status: z.enum(["queued", "processing", "ready", "failed"]),
  filename: z.string(),
  source_label: z.string().nullable().optional(),
  page_count: z.number().int().positive().nullable().optional(),
  error_code: z.string().nullable().optional(),
  received_at: z.string(),
  completed_at: z.string().nullable().optional(),
});

function upstreamError(status: number, payload: unknown): Error {
  const detail =
    payload &&
    typeof payload === "object" &&
    typeof (payload as Record<string, unknown>).detail === "string"
      ? (payload as Record<string, string>).detail
      : "Climate Advisor rejected the Concept Note request";
  return createHttpError(status, detail, { expose: status < 500 });
}

export async function loadConceptNoteRunCity(args: {
  runId: string;
  userId: string;
  requestId?: string;
}): Promise<string> {
  const response = await callConceptNoteApi({
    path: `/v1/concept-notes/${args.runId}`,
    userId: args.userId,
    requestId: args.requestId,
    searchParams: { user_id: args.userId },
  });
  const payload = await readConceptNoteApiPayload(response);
  if (!response.ok) throw upstreamError(response.status, payload);
  const parsed = runSchema.safeParse(payload);
  if (!parsed.success) {
    throw new createHttpError.BadGateway(
      "Climate Advisor returned an invalid concept-note run",
    );
  }
  return parsed.data.city_id;
}

export async function loadConceptNoteUpload(args: {
  runId: string;
  uploadId: string;
  userId: string;
  requestId?: string;
}) {
  const response = await callConceptNoteApi({
    path: `/v1/concept-notes/${args.runId}/uploads/${args.uploadId}`,
    userId: args.userId,
    requestId: args.requestId,
  });
  const payload = await readConceptNoteApiPayload(response);
  if (!response.ok) throw upstreamError(response.status, payload);
  const parsed = conceptNoteUploadSchema.safeParse(payload);
  if (!parsed.success) {
    throw new createHttpError.BadGateway(
      "Climate Advisor returned invalid Concept Note upload state",
    );
  }
  return parsed.data;
}

export async function updateConceptNoteUpload(args: {
  runId: string;
  uploadId: string;
  userId: string;
  action: "failed" | "retry";
  requestId?: string;
  body?: Record<string, unknown>;
}): Promise<void> {
  const response = await callConceptNoteApi({
    path: `/v1/concept-notes/${args.runId}/uploads/${args.uploadId}/${args.action}`,
    userId: args.userId,
    method: "POST",
    requestId: args.requestId,
    body: args.body,
  });
  const payload = await readConceptNoteApiPayload(response);
  if (!response.ok) throw upstreamError(response.status, payload);
}
