import { Op, UniqueConstraintError } from "sequelize";
import { db } from "@/models";
import {
  registerNativeInput,
  supersedeNativeInput,
  withdrawNativeInput,
} from "@/backend/NativeInputCatalogService";
import {
  INGEST_EXTRACT_CATALOG_KIND,
  assertDocumentReusable,
  buildIngestDocumentPathBInput,
  buildIngestExtractPathAInput,
  initialMarkdownReady,
  sameDocumentScope,
  type IngestDocumentPool,
  type IngestDocumentRecord,
  type PublishIngestExtractInput,
  type StoreIngestDocumentInput,
  type WithdrawIngestDocumentInput,
} from "./document-pool";
import { IngestItemError } from "./types";

function toRecord(
  row: {
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
    withdrawnAt?: Date | null;
    bytesPurgedAt?: Date | null;
  },
  availability: IngestDocumentRecord["availability"] = "active",
  supersededByDocumentId: string | null = null,
): IngestDocumentRecord {
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
    availability,
    supersededByDocumentId,
    withdrawnAt: row.withdrawnAt ?? null,
    bytesPurgedAt: row.bytesPurgedAt ?? null,
  };
}

async function stampWithdrawnAt(documentId: string): Promise<void> {
  await db.models.IngestDocument.update(
    { withdrawnAt: new Date() },
    { where: { id: documentId, withdrawnAt: { [Op.is]: null } } },
  );
}

/** CNB Path B rows are a second catalog pointer. Default withdraw must drop them too. */
async function withdrawCnbCatalogs(documentId: string): Promise<void> {
  // JSONB containment is a runtime operator. The catalog attribute type
  // does not accept a plain object under Op.contains.
  const where: Record<string, unknown> = {
    kind: "cnb_upload",
    availability: "active",
    labels: { [Op.contains]: { documentId } },
  };
  const rows = await db.models.NativeInputCatalog.findAll({ where });
  for (const row of rows) {
    await withdrawNativeInput(row.id);
  }
}

async function catalogState(catalogId: string | null | undefined): Promise<{
  availability: IngestDocumentRecord["availability"];
  supersededByDocumentId: string | null;
}> {
  if (!catalogId) {
    return { availability: "active", supersededByDocumentId: null };
  }
  const catalog = await db.models.NativeInputCatalog.findByPk(catalogId);
  const availability = catalog?.availability ?? "active";
  if (!catalog?.supersededById) {
    return { availability, supersededByDocumentId: null };
  }
  const replacement = await db.models.NativeInputCatalog.findByPk(
    catalog.supersededById,
  );
  return {
    availability,
    supersededByDocumentId: replacement?.sourceId ?? null,
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
    const where = {
      contentHash: input.contentHash,
      cityId: input.scope.cityId ?? null,
      projectId: input.scope.projectId ?? null,
      organizationId: input.scope.organizationId ?? null,
    };
    const activeWhere = { ...where, withdrawnAt: { [Op.is]: null } };
    const existing = await db.models.IngestDocument.findOne({
      where: activeWhere,
    });
    if (existing) {
      if (input.s3Key && !existing.s3Key) {
        await existing.update({ s3Key: input.s3Key });
      }
      return { document: toRecord(existing), created: false };
    }

    try {
      const created = await db.models.IngestDocument.create({
        ...where,
        originalFileName: input.originalFileName,
        uploadedByUserId: input.uploadedByUserId ?? null,
        visibility: input.visibility,
        markdownReady:
          input.markdownReady ?? initialMarkdownReady(input.originalFileName),
        s3Key: input.s3Key ?? null,
        data: input.buffer,
      });
      return { document: toRecord(created), created: true };
    } catch (error) {
      if (!(error instanceof UniqueConstraintError)) throw error;
      const raced = await db.models.IngestDocument.findOne({
        where: activeWhere,
      });
      if (!raced) throw error;
      return { document: toRecord(raced), created: false };
    }
  }

  async get(documentId: string): Promise<IngestDocumentRecord | null> {
    const row = await db.models.IngestDocument.findByPk(documentId);
    if (!row) return null;
    const state = await catalogState(row.catalogId);
    return toRecord(row, state.availability, state.supersededByDocumentId);
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
    const state = await catalogState(row.catalogId);
    return toRecord(row, state.availability, state.supersededByDocumentId);
  }

  async publishPathA(
    document: IngestDocumentRecord,
    input: PublishIngestExtractInput,
  ): Promise<{ catalogId: string; created: boolean }> {
    const registered = await registerNativeInput(
      buildIngestExtractPathAInput(document, input),
    );
    return { catalogId: registered.catalog.id, created: registered.created };
  }

  async withdraw(
    documentId: string,
    input: WithdrawIngestDocumentInput = {},
  ): Promise<IngestDocumentRecord> {
    const document = await this.get(documentId);
    if (!document) {
      throw new IngestItemError("document_not_found");
    }
    if ((document.availability ?? "active") === "superseded") {
      throw new IngestItemError("document_superseded");
    }
    if ((document.availability ?? "active") !== "withdrawn") {
      let catalogId = document.catalogId ?? null;
      if (!catalogId) {
        catalogId = (await this.publishPathB(document)).catalogId;
      }
      await withdrawNativeInput(catalogId);
    }
    await withdrawCnbCatalogs(documentId);
    await stampWithdrawnAt(documentId);
    const modules = input.withdrawExtractsFor ?? [];
    if (modules.length > 0) {
      const extracts = await db.models.NativeInputCatalog.findAll({
        where: {
          kind: INGEST_EXTRACT_CATALOG_KIND,
          availability: "active",
          owningModule: modules,
        },
      });
      for (const extract of extracts) {
        if (extract.labels?.documentId !== documentId) continue;
        await withdrawNativeInput(extract.id);
      }
    }
    const withdrawn = await this.get(documentId);
    if (!withdrawn) {
      throw new IngestItemError("document_not_found");
    }
    return withdrawn;
  }

  async promoteToCity(documentId: string): Promise<IngestDocumentRecord> {
    const document = await this.get(documentId);
    if (!document) {
      throw new IngestItemError("document_not_found");
    }
    const availability = document.availability ?? "active";
    if (availability === "withdrawn") {
      throw new IngestItemError("document_withdrawn");
    }
    if (availability === "superseded") {
      throw new IngestItemError("document_superseded");
    }
    if (document.visibility !== "run" && document.visibility !== "city") {
      throw new IngestItemError(
        "validation_failed",
        "Only a concept-note attachment can be marked as a city document",
      );
    }
    if (document.visibility !== "city") {
      await db.models.IngestDocument.update(
        { visibility: "city" },
        { where: { id: documentId } },
      );
    }
    const where: Record<string, unknown> = {
      [Op.or]: [
        ...(document.catalogId ? [{ id: document.catalogId }] : []),
        {
          kind: "cnb_upload",
          labels: { [Op.contains]: { documentId } },
        },
        { sourceType: "ingest_document", sourceId: documentId },
      ],
    };
    const catalogs = await db.models.NativeInputCatalog.findAll({ where });
    for (const catalog of catalogs) {
      await catalog.update({
        labels: { ...(catalog.labels ?? {}), visibility: "city" },
      });
    }
    const promoted = await this.get(documentId);
    if (!promoted) {
      throw new IngestItemError("document_not_found");
    }
    return promoted;
  }

  async supersede(
    documentId: string,
    replacementDocumentId: string,
  ): Promise<{
    previous: IngestDocumentRecord;
    replacement: IngestDocumentRecord;
  }> {
    if (documentId === replacementDocumentId) {
      throw new IngestItemError(
        "validation_failed",
        "Superseding a document requires a different replacement id",
      );
    }
    const previous = await this.get(documentId);
    if (!previous) {
      throw new IngestItemError("document_not_found");
    }
    assertDocumentReusable(previous);
    const replacement = await this.get(replacementDocumentId);
    if (!replacement) {
      throw new IngestItemError("document_not_found");
    }
    assertDocumentReusable(replacement);
    if (!sameDocumentScope(previous, replacement)) {
      throw new IngestItemError(
        "missing_scope",
        "Replacement document is not in the same city, project, or organization",
      );
    }
    const previousCatalogId =
      previous.catalogId ?? (await this.publishPathB(previous)).catalogId;
    const publishedReplacement = replacement.catalogId
      ? replacement
      : {
          ...replacement,
          catalogId: (await this.publishPathB(replacement)).catalogId,
        };
    await supersedeNativeInput(
      previousCatalogId,
      buildIngestDocumentPathBInput(publishedReplacement),
    );
    const nextPrevious = await this.get(documentId);
    const nextReplacement = await this.get(replacementDocumentId);
    if (!nextPrevious || !nextReplacement) {
      throw new IngestItemError("document_not_found");
    }
    return { previous: nextPrevious, replacement: nextReplacement };
  }
}
