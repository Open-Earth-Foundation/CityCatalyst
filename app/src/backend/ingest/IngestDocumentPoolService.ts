import { db } from "@/models";
import { registerNativeInput } from "@/backend/NativeInputCatalogService";
import {
  buildIngestDocumentPathBInput,
  initialMarkdownReady,
  type IngestDocumentPool,
  type IngestDocumentRecord,
  type StoreIngestDocumentInput,
} from "./document-pool";

function toRecord(row: {
  id: string;
  contentHash: string;
  originalFileName: string;
  cityId?: string | null;
  projectId?: string | null;
  organizationId?: string | null;
  uploadedByUserId?: string | null;
  visibility: IngestDocumentRecord["visibility"];
  markdownReady: boolean;
  catalogId?: string | null;
  s3Key?: string | null;
  data?: Buffer | Uint8Array | null;
}): IngestDocumentRecord {
  return {
    id: row.id,
    contentHash: row.contentHash,
    originalFileName: row.originalFileName,
    cityId: row.cityId,
    projectId: row.projectId,
    organizationId: row.organizationId,
    uploadedByUserId: row.uploadedByUserId,
    visibility: row.visibility,
    markdownReady: row.markdownReady,
    catalogId: row.catalogId,
    s3Key: row.s3Key ?? null,
    buffer: row.data ? Buffer.from(row.data) : null,
  };
}

/**
 * Durable document pool + Path B catalog. Does not write GHGI/CCRA/CNB SoT.
 */
export class SequelizeIngestDocumentPool implements IngestDocumentPool {
  async store(input: StoreIngestDocumentInput): Promise<{
    document: IngestDocumentRecord;
    created: boolean;
  }> {
    const existing = await db.models.IngestDocument.findOne({
      where: {
        contentHash: input.contentHash,
        cityId: input.scope.cityId ?? null,
        projectId: input.scope.projectId ?? null,
        organizationId: input.scope.organizationId ?? null,
      },
    });
    if (existing) {
      return { document: toRecord(existing), created: false };
    }

    const created = await db.models.IngestDocument.create({
      contentHash: input.contentHash,
      originalFileName: input.originalFileName,
      cityId: input.scope.cityId ?? null,
      projectId: input.scope.projectId ?? null,
      organizationId: input.scope.organizationId ?? null,
      uploadedByUserId: input.uploadedByUserId ?? null,
      visibility: input.visibility,
      markdownReady: input.markdownReady ?? initialMarkdownReady(input.originalFileName),
      data: input.buffer,
    });
    return { document: toRecord(created), created: true };
  }

  async get(documentId: string): Promise<IngestDocumentRecord | null> {
    const row = await db.models.IngestDocument.findByPk(documentId);
    return row ? toRecord(row) : null;
  }

  async publishPathB(document: IngestDocumentRecord): Promise<{
    catalogId: string;
    created: boolean;
  }> {
    const registered = await registerNativeInput(
      buildIngestDocumentPathBInput(document),
    );
    await db.models.IngestDocument.update(
      { catalogId: registered.catalog.id },
      { where: { id: document.id } },
    );
    return { catalogId: registered.catalog.id, created: registered.created };
  }

  async markMarkdownReady(documentId: string): Promise<IngestDocumentRecord> {
    const row = await db.models.IngestDocument.findByPk(documentId);
    if (!row) {
      throw new Error(`Ingest document ${documentId} not found`);
    }
    await row.update({ markdownReady: true });
    if (row.catalogId) {
      const catalog = await db.models.NativeInputCatalog.findByPk(row.catalogId);
      if (catalog) {
        await catalog.update({ markdownReady: true });
      }
    }
    return toRecord(row);
  }
}
