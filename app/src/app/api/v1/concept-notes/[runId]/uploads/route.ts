import { randomUUID } from "node:crypto";

import createHttpError from "http-errors";
import { NextResponse } from "next/server";
import { z } from "zod";

import {
  loadConceptNoteRunCity,
  updateConceptNoteUpload,
} from "@/backend/ConceptNoteUploadService";
import InventoryFileStorageService from "@/backend/InventoryFileStorageService";
import {
  conceptNotePdfSourceKey,
  enqueueConceptNotePdfOcr,
} from "@/backend/PdfOcrService";
import {
  callConceptNoteApi,
  readConceptNoteApiPayload,
} from "@/backend/concept-notes";
import { INVENTORY_IMPORT_MAX_FILE_SIZE_BYTES } from "@/backend/inventory-import-file-limits";
import { PermissionService } from "@/backend/permissions/PermissionService";
import { apiHandler } from "@/util/api";

const paramsSchema = z.object({ runId: z.string().uuid() });
const createResponseSchema = z.object({
  upload_id: z.string().uuid(),
  status: z.enum(["queued", "processing", "ready", "failed"]),
});

function requestId(req: Request): string | undefined {
  return req.headers.get("x-request-id")?.trim() || undefined;
}

export const POST = apiHandler(async (req, { session, params }) => {
  if (!session?.user?.id) {
    throw new createHttpError.Unauthorized("Authentication required");
  }
  const { runId } = paramsSchema.parse(params);
  const userId = session.user.id;
  const currentRequestId = requestId(req);

  // Authenticate the run and city before consuming the multipart file body.
  const cityId = await loadConceptNoteRunCity({
    runId,
    userId,
    requestId: currentRequestId,
  });
  await PermissionService.canAccessCity(session, cityId, {
    includeResource: false,
  });

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    throw new createHttpError.BadRequest("Invalid multipart upload");
  }
  const fileEntry = formData.get("file");
  if (!(fileEntry instanceof File)) {
    throw new createHttpError.BadRequest("A PDF file is required");
  }
  const filename = fileEntry.name.trim();
  if (!filename || filename.length > 255) {
    throw new createHttpError.UnprocessableEntity("Invalid PDF filename");
  }
  if (
    fileEntry.type !== "application/pdf" ||
    !filename.toLowerCase().endsWith(".pdf")
  ) {
    throw new createHttpError.UnsupportedMediaType(
      "Only application/pdf uploads are accepted",
    );
  }
  if (fileEntry.size === 0) {
    throw new createHttpError.UnprocessableEntity("PDF file is empty");
  }
  if (fileEntry.size > INVENTORY_IMPORT_MAX_FILE_SIZE_BYTES) {
    throw new createHttpError.PayloadTooLarge(
      "PDF exceeds the 20 MiB upload limit",
    );
  }
  const fileBuffer = Buffer.from(await fileEntry.arrayBuffer());
  if (fileBuffer.subarray(0, 5).toString("ascii") !== "%PDF-") {
    throw new createHttpError.UnprocessableEntity(
      "Uploaded file does not have a valid PDF signature",
    );
  }
  const sourceLabelEntry = formData.get("source_label");
  const sourceLabel =
    typeof sourceLabelEntry === "string" && sourceLabelEntry.trim()
      ? sourceLabelEntry.trim()
      : null;
  if (sourceLabel && sourceLabel.length > 255) {
    throw new createHttpError.UnprocessableEntity("Source label is too long");
  }

  const uploadId = randomUUID();
  const createResponse = await callConceptNoteApi({
    path: `/v1/concept-notes/${runId}/uploads`,
    userId,
    method: "POST",
    requestId: currentRequestId,
    body: {
      upload_id: uploadId,
      user_id: userId,
      filename,
      source_label: sourceLabel,
    },
  });
  const createPayload = await readConceptNoteApiPayload(createResponse);
  if (!createResponse.ok) {
    return NextResponse.json(createPayload, { status: createResponse.status });
  }
  const created = createResponseSchema.safeParse(createPayload);
  if (!created.success || created.data.upload_id !== uploadId) {
    await updateConceptNoteUpload({
      runId,
      uploadId,
      userId,
      action: "failed",
      requestId: currentRequestId,
      body: { error_code: "ca_upload_response_invalid" },
    }).catch(() => {});
    throw new createHttpError.BadGateway(
      "Climate Advisor returned an invalid upload identity",
    );
  }

  const sourceKey = conceptNotePdfSourceKey(uploadId);
  let failureCode = "source_storage_failed";
  try {
    await InventoryFileStorageService.putFile(
      sourceKey,
      fileBuffer,
      "application/pdf",
    );
    failureCode = "ocr_enqueue_failed";
    await enqueueConceptNotePdfOcr(uploadId);
  } catch {
    await InventoryFileStorageService.deleteFile(sourceKey).catch(() => {});
    await updateConceptNoteUpload({
      runId,
      uploadId,
      userId,
      action: "failed",
      requestId: currentRequestId,
      body: { error_code: failureCode },
    }).catch(() => {});
    throw new createHttpError.ServiceUnavailable(
      "PDF conversion could not be queued",
    );
  }

  return NextResponse.json(
    { upload_id: uploadId, status: "queued" },
    { status: 202 },
  );
});
