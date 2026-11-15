import { createHash } from "node:crypto";

import createHttpError from "http-errors";
import { Op } from "sequelize";
import { v5 as uuidv5 } from "uuid";
import { z } from "zod";

import {
  loadConceptNoteUploadRun,
  updateConceptNoteUpload,
} from "@/backend/ConceptNoteUploadService";
import { triggerConceptNoteSourceProcessing } from "@/backend/ConceptNoteSourceProcessingService";
import InventoryFileStorageService from "@/backend/InventoryFileStorageService";
import { registerNativeInput } from "@/backend/NativeInputCatalogService";
import {
  conceptNotePdfSourceKey,
  enqueueConceptNotePdfOcr,
  getConceptNotePdfOcrJob,
  normalizeConceptNoteMarkdown,
  normalizeConceptNotePdfOcrStatus,
  registerConceptNoteMarkdownUpload,
  retryConceptNotePdfOcr,
} from "@/backend/PdfOcrService";
import {
  callConceptNoteApi,
  readConceptNoteApiPayload,
} from "@/backend/concept-notes";
import { buildCnbUploadPathBInput } from "@/backend/ingest/cnb-path-b";
import { assertDocumentReusable } from "@/backend/ingest/document-pool";
import { SequelizeIngestDocumentPool } from "@/backend/ingest/IngestDocumentPoolService";
import { INVENTORY_IMPORT_MAX_FILE_SIZE_BYTES } from "@/backend/inventory-import-file-limits";
import { PermissionService } from "@/backend/permissions/PermissionService";
import type { AppSession } from "@/lib/auth";
import { db } from "@/models";
import { FeatureFlags, hasServerFeatureFlag } from "@/util/feature-flags";

export const conceptNoteDocumentParams = z.object({ runId: z.string().uuid() });
export const conceptNoteDocumentQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).max(10000).default(0),
});
export const conceptNoteDocumentAttach = z
  .object({
    document_id: z.string().uuid(),
    source_role: z
      .enum(["reference", "climate_action_plan"])
      .default("reference"),
  })
  .strict();

type Target = {
  runId: string;
  userId: string;
  cityId: string;
  projectId: string | null;
  organizationId: string;
  requestId?: string;
};

export async function loadConceptNoteDocumentTarget(
  session: AppSession | null,
  runId: string,
  requestId?: string,
  mutation = false,
): Promise<Target> {
  if (!session?.user?.id)
    throw new createHttpError.Unauthorized("Authentication required");
  if (
    !hasServerFeatureFlag(FeatureFlags.CONCEPT_NOTE_BUILDER) ||
    !hasServerFeatureFlag(FeatureFlags.CA_SERVICE_INTEGRATION)
  ) {
    throw new createHttpError.NotFound("Concept Note Builder is unavailable");
  }
  const userId = session.user.id;
  const { cityId } = await loadConceptNoteUploadRun({
    runId,
    userId,
    requestId,
  });
  // runId routes cannot use apiHandler's city-param frozen check.
  const access = await PermissionService.canAccessCity(session, cityId, {
    includeResource: false,
    requireActive: mutation,
  });
  const city = await db.models.City.findByPk(cityId, {
    attributes: ["cityId", "projectId"],
  });
  if (!city) throw new createHttpError.NotFound("City not found");
  return {
    runId,
    userId,
    cityId,
    projectId: city.projectId ?? null,
    organizationId: access.organizationId,
    requestId,
  };
}

function reusableQuery(target: Target) {
  return {
    where: {
      cityId: target.cityId,
      visibility: "city",
      withdrawnAt: { [Op.is]: null },
      bytesPurgedAt: { [Op.is]: null },
      [Op.and]: [
        { [Op.or]: [{ projectId: null }, { projectId: target.projectId }] },
        {
          [Op.or]: [
            { organizationId: null },
            { organizationId: target.organizationId },
          ],
        },
        { originalFileName: { [Op.iRegexp]: "\\.(pdf|md|markdown)$" } },
      ],
    },
    include: [
      {
        model: db.models.NativeInputCatalog,
        as: "catalog",
        required: true,
        attributes: [],
        where: {
          availability: "active",
          kind: ["ingest_document", "cnb_upload"],
        },
      },
    ],
  };
}

function sourceFormat(filename: string): "pdf" | "markdown" {
  return filename.toLowerCase().endsWith(".pdf") ? "pdf" : "markdown";
}

function associationRejection(payload: unknown, status: number) {
  const publicMessages: Record<string, string> = {
    concept_note_upload_limit_reached:
      "This note already has the maximum of 10 uploads",
    upload_identity_conflict: "Upload metadata cannot change",
  };
  const code = z.object({ code: z.string() }).safeParse(payload);
  const message =
    code.success && Object.hasOwn(publicMessages, code.data.code)
      ? publicMessages[code.data.code]
      : undefined;
  // Only documented public failures cross the CC boundary; upstream internals stay private.
  return {
    ...(message && code.success ? { code: code.data.code } : {}),
    detail: message ?? "Climate Advisor rejected the document association",
    status,
  };
}

export async function listConceptNoteDocuments(
  target: Target,
  page: z.infer<typeof conceptNoteDocumentQuery>,
) {
  const rows = await db.models.IngestDocument.findAll({
    ...reusableQuery(target),
    attributes: ["id", "originalFileName", "markdownReady"],
    order: [
      ["created", "DESC"],
      ["id", "ASC"],
    ],
    limit: page.limit + 1,
    offset: page.offset,
  });
  return {
    data: rows.slice(0, page.limit).map((row) => ({
      documentId: row.id,
      filename: row.originalFileName,
      sourceFormat: sourceFormat(row.originalFileName),
      markdownReady: row.markdownReady,
    })),
    pagination: { ...page, hasMore: rows.length > page.limit },
  };
}

export async function attachConceptNoteDocument(
  target: Target,
  input: z.infer<typeof conceptNoteDocumentAttach>,
) {
  const query = reusableQuery(target);
  const available = await db.models.IngestDocument.findOne({
    ...query,
    where: { ...query.where, id: input.document_id },
    attributes: ["id"],
  });
  if (!available)
    throw new createHttpError.NotFound("Reusable document not found");
  const document = await new SequelizeIngestDocumentPool().get(
    input.document_id,
  );
  if (!document)
    throw new createHttpError.NotFound("Reusable document not found");
  assertDocumentReusable(document);
  if (document.withdrawnAt || document.bytesPurgedAt) {
    throw new createHttpError.NotFound("Reusable document not found");
  }
  const bytes =
    document.buffer ??
    (await InventoryFileStorageService.resolveImportedFileBuffer({
      s3Key: document.s3Key,
    }));
  if (!bytes)
    throw new createHttpError.ServiceUnavailable(
      "Document bytes are unavailable",
    );
  // The pool accepts .markdown; CA's immutable Markdown contract requires .md.
  const filename = document.originalFileName.replace(/\.markdown$/i, ".md");
  if (
    !bytes.length ||
    bytes.length > INVENTORY_IMPORT_MAX_FILE_SIZE_BYTES ||
    !filename.trim() ||
    filename.length > 255
  ) {
    throw new createHttpError.UnprocessableEntity(
      "Document cannot be attached as a Concept Note source",
    );
  }
  if (
    createHash("sha256").update(bytes).digest("hex") !== document.contentHash
  ) {
    throw new createHttpError.Conflict(
      "Document bytes do not match their registered identity",
    );
  }
  const format = sourceFormat(document.originalFileName);
  let markdown: string | undefined;
  if (format === "pdf") {
    if (bytes.subarray(0, 5).toString("ascii") !== "%PDF-") {
      throw new createHttpError.UnprocessableEntity(
        "Document has an invalid PDF signature",
      );
    }
  } else {
    try {
      markdown = normalizeConceptNoteMarkdown(
        new TextDecoder("utf-8", { fatal: true }).decode(bytes),
      );
    } catch {
      throw new createHttpError.UnprocessableEntity(
        "Document must contain valid UTF-8 Markdown",
      );
    }
  }
  // A target-specific identity prevents sharing the original run's private CA upload.
  const uploadId = uuidv5(
    `concept-note-document:${target.runId.toLowerCase()}:${target.userId}:${document.id}`,
    uuidv5.URL,
  );
  const response = await callConceptNoteApi({
    path: `/v1/concept-notes/${target.runId}/uploads`,
    userId: target.userId,
    method: "POST",
    requestId: target.requestId,
    body: {
      upload_id: uploadId,
      user_id: target.userId,
      filename,
      source_label: null,
      source_format: format,
      source_role: input.source_role,
    },
  });
  const payload = await readConceptNoteApiPayload(response);
  if (!response.ok)
    return {
      payload: associationRejection(payload, response.status),
      status: response.status,
    };
  const created = z
    .object({
      upload_id: z.literal(uploadId),
      status: z.enum(["queued", "processing", "ready", "failed"]),
    })
    .safeParse(payload);
  if (!created.success)
    throw new createHttpError.BadGateway(
      "Climate Advisor returned an invalid upload identity",
    );
  if (created.data.status === "failed") {
    await updateConceptNoteUpload({ ...target, uploadId, action: "retry" });
  }
  let job;
  try {
    if (format === "pdf") {
      // OCR source keys are immutable and upload-specific; copy only on first handoff.
      const existing = await getConceptNotePdfOcrJob(uploadId);
      if (!existing)
        await InventoryFileStorageService.putFile(
          conceptNotePdfSourceKey(uploadId),
          bytes,
          "application/pdf",
        );
      job = await enqueueConceptNotePdfOcr(uploadId);
    } else {
      job = await registerConceptNoteMarkdownUpload(uploadId, markdown!);
    }
    if (normalizeConceptNotePdfOcrStatus(job).status === "failed")
      await retryConceptNotePdfOcr(job);
    // Publish the association against the existing document; never store another pool row.
    const registration = buildCnbUploadPathBInput(document, uploadId);
    await registerNativeInput({
      ...registration,
      userId: target.userId,
      labels: {
        ...registration.labels,
        visibility: "run",
        runId: target.runId,
        sourceRole: input.source_role,
      },
    });
  } catch {
    await updateConceptNoteUpload({
      ...target,
      uploadId,
      action: "failed",
      errorCode: "document_reuse_handoff_failed",
    }).catch(() => {});
    throw new createHttpError.ServiceUnavailable(
      "Document processing could not be prepared",
    );
  }
  triggerConceptNoteSourceProcessing();
  const state = normalizeConceptNotePdfOcrStatus(job);
  return {
    payload: {
      documentId: document.id,
      uploadId,
      status: state.status,
      stage: state.stage,
      canRetry: state.canRetry,
      filename,
      sourceLabel: null,
      sourceRole: input.source_role,
      ...(state.retryKind ? { retryKind: state.retryKind } : {}),
    },
    status: 202,
  };
}
