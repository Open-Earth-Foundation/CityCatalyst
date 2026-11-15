import { Op } from "sequelize";
import { z } from "zod";
import { db } from "@/models";
import {
  registerNativeInput,
  type RegisterNativeInputInput,
} from "@/backend/NativeInputCatalogService";
import type { IngestDocumentPool, IngestDocumentRecord } from "./document-pool";
import type { IngestVisibility } from "./types";
import { SequelizeIngestDocumentPool } from "./IngestDocumentPoolService";

/** Existing catalog kind. sourceId is the Climate Advisor upload id, not a new ingest id. */
export const CNB_UPLOAD_CATALOG_KIND = "cnb_upload";
export const CNB_UPLOAD_OWNING_MODULE = "cnb";
export const CNB_UPLOAD_SOURCE_TYPE = "cnb_upload";

export interface RegisterCnbUploadInput {
  uploadId: string;
  cityId: string;
  userId: string;
  filename: string;
  contentHash: string;
  buffer: Buffer;
  s3Key?: string | null;
  markdownReady: boolean;
}

export interface CnbCatalogRegistry {
  findCatalog(
    uploadId: string,
  ): Promise<{
    id: string;
    documentId?: string;
    userId?: string | null;
  } | null>;
  registerCatalog(
    input: RegisterNativeInputInput,
  ): Promise<{ id: string; created: boolean }>;
  updateCatalog(
    catalogId: string,
    input: RegisterNativeInputInput,
  ): Promise<void>;
  linkCatalog(documentId: string, catalogId: string): Promise<void>;
}

export function buildCnbUploadPathBInput(
  document: IngestDocumentRecord,
  uploadId: string,
): RegisterNativeInputInput {
  return {
    kind: CNB_UPLOAD_CATALOG_KIND,
    owningModule: CNB_UPLOAD_OWNING_MODULE,
    sourceType: CNB_UPLOAD_SOURCE_TYPE,
    sourceId: uploadId,
    userId: document.uploadedByUserId ?? null,
    cityId: document.cityId ?? null,
    projectId: document.projectId ?? null,
    organizationId: document.organizationId ?? null,
    contentDigest: document.contentHash,
    markdownReady: document.markdownReady,
    labels: {
      originalFileName: document.originalFileName,
      visibility: document.visibility,
      documentId: document.id,
    },
  };
}

/**
 * Store the concept-note bytes on the pool and publish a Path B `cnb_upload` row.
 * Call only after Climate Advisor has accepted `uploadId`. A retry of the same id
 * does not create a second catalog row. Visibility stays `run` until promote.
 */
export async function registerCnbUploadOnPool(
  pool: IngestDocumentPool,
  input: RegisterCnbUploadInput,
  registry: CnbCatalogRegistry,
): Promise<{
  documentId: string;
  catalogId: string;
  created: boolean;
  visibility: IngestVisibility;
}> {
  const existing = await registry.findCatalog(input.uploadId);
  const linked = existing?.documentId
    ? await pool.get(existing.documentId)
    : null;
  const preserveLink =
    linked &&
    existing?.userId === input.userId &&
    linked.contentHash === input.contentHash &&
    linked.cityId === input.cityId &&
    !linked.projectId &&
    !linked.organizationId &&
    linked.availability === "active" &&
    !linked.withdrawnAt &&
    !linked.bytesPurgedAt &&
    (linked.visibility === "city" ||
      (linked.visibility === "run" && linked.privateOwnerId === input.userId));
  const stored = preserveLink
    ? { document: linked, created: false }
    : await pool.store({
        contentHash: input.contentHash,
        originalFileName: input.filename,
        buffer: input.buffer,
        scope: { cityId: input.cityId },
        uploadedByUserId: input.userId,
        visibility: "run",
        markdownReady: input.markdownReady,
        s3Key: input.s3Key ?? null,
      });
  const catalogInput = buildCnbUploadPathBInput(
    stored.document,
    input.uploadId,
  );
  const associationInput = {
    ...catalogInput,
    userId: input.userId,
    labels: { ...catalogInput.labels, originalFileName: input.filename },
  };
  if (existing) {
    // A full authorized replay also repairs pre-isolation actor/document pointers.
    await registry.updateCatalog(existing.id, associationInput);
    if (!stored.document.catalogId) {
      await registry.linkCatalog(stored.document.id, existing.id);
    }
    return {
      documentId: stored.document.id,
      catalogId: existing.id,
      created: false,
      visibility: stored.document.visibility,
    };
  }
  const registered = await registry.registerCatalog(associationInput);
  if (!stored.document.catalogId) {
    await registry.linkCatalog(stored.document.id, registered.id);
  }
  return {
    documentId: stored.document.id,
    catalogId: registered.id,
    created: registered.created,
    visibility: stored.document.visibility,
  };
}

export async function registerConceptNoteOnDocumentPool(
  input: RegisterCnbUploadInput,
): Promise<{
  documentId: string;
  catalogId: string;
  created: boolean;
  visibility: IngestVisibility;
}> {
  const pool = new SequelizeIngestDocumentPool();
  return registerCnbUploadOnPool(pool, input, {
    async findCatalog(uploadId) {
      const row = await db.models.NativeInputCatalog.findOne({
        where: {
          sourceType: CNB_UPLOAD_SOURCE_TYPE,
          sourceId: uploadId,
          availability: { [Op.ne]: "withdrawn" },
        },
      });
      return row
        ? {
            id: row.id,
            documentId:
              typeof row.labels?.documentId === "string"
                ? row.labels.documentId
                : undefined,
            userId: row.userId,
          }
        : null;
    },
    async registerCatalog(catalogInput) {
      const result = await registerNativeInput(catalogInput);
      return { id: result.catalog.id, created: result.created };
    },
    async updateCatalog(catalogId, catalogInput) {
      await db.models.NativeInputCatalog.update(catalogInput, {
        where: { id: catalogId },
      });
    },
    async linkCatalog(documentId, catalogId) {
      await db.models.IngestDocument.update(
        { catalogId },
        { where: { id: documentId, catalogId: { [Op.is]: null } } },
      );
    },
  });
}

/** Resolve sharing metadata only after the caller has authorized the target upload. */
export async function loadConceptNoteUploadDocument(uploadId: string): Promise<{
  documentId?: string;
  visibility?: "run" | "city";
}> {
  const association = await db.models.NativeInputCatalog.findOne({
    where: { sourceType: CNB_UPLOAD_SOURCE_TYPE, sourceId: uploadId },
  });
  const id = z.string().uuid().safeParse(association?.labels?.documentId);
  if (!id.success) return {};
  const document = await db.models.IngestDocument.findByPk(id.data, {
    attributes: ["id", "visibility"],
  });
  return document
    ? {
        documentId: document.id,
        ...(document.visibility === "run" || document.visibility === "city"
          ? { visibility: document.visibility }
          : {}),
      }
    : {};
}

/** Call only after the PDF OCR job has persisted a successful immutable result. */
export async function markConceptNoteDocumentMarkdownReady(
  uploadId: string,
): Promise<void> {
  const association = await db.models.NativeInputCatalog.findOne({
    where: {
      sourceType: CNB_UPLOAD_SOURCE_TYPE,
      sourceId: uploadId,
      availability: "active",
    },
  });
  const id = z.string().uuid().safeParse(association?.labels?.documentId);
  if (!id.success) return;
  const pool = new SequelizeIngestDocumentPool();
  const document = await pool.get(id.data);
  if (
    !document ||
    document.availability !== "active" ||
    document.withdrawnAt ||
    document.bytesPurgedAt
  )
    return;
  await pool.markMarkdownReady(document.id);
  const where: Record<string, unknown> = {
    sourceType: CNB_UPLOAD_SOURCE_TYPE,
    availability: "active",
    labels: { [Op.contains]: { documentId: document.id } },
  };
  await db.models.NativeInputCatalog.update({ markdownReady: true }, { where });
}
