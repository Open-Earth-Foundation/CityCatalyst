import { Op } from "sequelize";
import { db } from "@/models";
import {
  registerNativeInput,
  type RegisterNativeInputInput,
} from "@/backend/NativeInputCatalogService";
import type { IngestDocumentPool, IngestDocumentRecord } from "./document-pool";
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
  findCatalog(uploadId: string): Promise<{ id: string } | null>;
  registerCatalog(
    input: RegisterNativeInputInput,
  ): Promise<{ id: string; created: boolean }>;
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
): Promise<{ documentId: string; catalogId: string; created: boolean }> {
  const stored = await pool.store({
    contentHash: input.contentHash,
    originalFileName: input.filename,
    buffer: input.buffer,
    scope: { cityId: input.cityId },
    uploadedByUserId: input.userId,
    visibility: "run",
    markdownReady: input.markdownReady,
    s3Key: input.s3Key ?? null,
  });
  const existing = await registry.findCatalog(input.uploadId);
  if (existing) {
    if (!stored.document.catalogId) {
      await registry.linkCatalog(stored.document.id, existing.id);
    }
    return {
      documentId: stored.document.id,
      catalogId: existing.id,
      created: false,
    };
  }
  const registered = await registry.registerCatalog(
    buildCnbUploadPathBInput(stored.document, input.uploadId),
  );
  if (!stored.document.catalogId) {
    await registry.linkCatalog(stored.document.id, registered.id);
  }
  return {
    documentId: stored.document.id,
    catalogId: registered.id,
    created: registered.created,
  };
}

export async function registerConceptNoteOnDocumentPool(
  input: RegisterCnbUploadInput,
): Promise<{ documentId: string; catalogId: string; created: boolean }> {
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
      return row ? { id: row.id } : null;
    },
    async registerCatalog(catalogInput) {
      const result = await registerNativeInput(catalogInput);
      return { id: result.catalog.id, created: result.created };
    },
    async linkCatalog(documentId, catalogId) {
      await db.models.IngestDocument.update(
        { catalogId },
        { where: { id: documentId, catalogId: { [Op.is]: null } } },
      );
    },
  });
}
