import { randomUUID } from "node:crypto";
import type { RegisterNativeInputInput } from "@/backend/NativeInputCatalogService";
import type { NativeInputCatalogAvailability } from "@/models/NativeInputCatalog";
import { IngestItemError, type IngestModuleId, type IngestScope, type IngestVisibility } from "./types";

/** Path B catalog identity for the Core document pool (not a module extract). */
export const INGEST_DOCUMENT_CATALOG_KIND = "ingest_document";
export const INGEST_DOCUMENT_OWNING_MODULE = "ingest";
export const INGEST_DOCUMENT_SOURCE_TYPE = "ingest_document";

/** Path A catalog identity for a module extract of a pooled document. */
export const INGEST_EXTRACT_CATALOG_KIND = "ingest_extract";
export const INGEST_EXTRACT_SOURCE_TYPE = "ingest_extract";

export interface IngestDocumentRecord {
  id: string;
  contentHash: string;
  originalFileName: string;
  cityId?: string | null;
  projectId?: string | null;
  organizationId?: string | null;
  uploadedByUserId?: string | null;
  visibility: IngestVisibility;
  markdownReady: boolean;
  catalogId?: string | null;
  buffer?: Buffer | null;
  s3Key?: string | null;
  availability?: NativeInputCatalogAvailability;
  supersededByDocumentId?: string | null;
  /** Set when Path B is withdrawn. Retention drops bytes after this, not the catalog row. */
  withdrawnAt?: Date | null;
  /** Set once withdrawn bytes have been removed from S3 and the pool blob. */
  bytesPurgedAt?: Date | null;
}

export interface StoreIngestDocumentInput {
  contentHash: string;
  originalFileName: string;
  buffer: Buffer;
  scope: IngestScope;
  uploadedByUserId?: string | null;
  visibility: IngestVisibility;
  markdownReady?: boolean;
  /** Concept-note PDFs already live under this key. The pool blob is a copy. */
  s3Key?: string | null;
}

export interface WithdrawIngestDocumentInput {
  /** Path A extracts to withdraw. Default none — imported values stay (D9). */
  withdrawExtractsFor?: IngestModuleId[];
}

export interface IngestDocumentPool {
  store(input: StoreIngestDocumentInput): Promise<{
    document: IngestDocumentRecord;
    created: boolean;
  }>;
  get(documentId: string): Promise<IngestDocumentRecord | null>;
  publishPathB(document: IngestDocumentRecord): Promise<{
    catalogId: string;
    created: boolean;
  }>;
  markMarkdownReady(documentId: string): Promise<IngestDocumentRecord>;
  publishPathA(
    document: IngestDocumentRecord,
    input: PublishIngestExtractInput,
  ): Promise<{ catalogId: string; created: boolean }>;
  withdraw(
    documentId: string,
    input?: WithdrawIngestDocumentInput,
  ): Promise<IngestDocumentRecord>;
  /** Mark a concept-note attachment as a city document so other modules can reuse it. */
  promoteToCity(documentId: string): Promise<IngestDocumentRecord>;
  supersede(
    documentId: string,
    replacementDocumentId: string,
  ): Promise<{
    previous: IngestDocumentRecord;
    replacement: IngestDocumentRecord;
  }>;
}

export interface PublishIngestExtractInput {
  owningModule: IngestModuleId;
  sourceId: string;
  inventoryId?: string | null;
}

export function scopeKey(scope: IngestScope): string {
  return [
    scope.cityId ?? "",
    scope.projectId ?? "",
    scope.organizationId ?? "",
  ].join("|");
}

export function sameDocumentScope(
  left: IngestDocumentRecord,
  right: IngestDocumentRecord,
): boolean {
  return (
    (left.cityId ?? null) === (right.cityId ?? null) &&
    (left.projectId ?? null) === (right.projectId ?? null) &&
    (left.organizationId ?? null) === (right.organizationId ?? null)
  );
}

export function assertDocumentReusable(document: IngestDocumentRecord): void {
  if (document.visibility === "run") {
    throw new IngestItemError(
      "document_unavailable",
      "Concept-note attachments cannot be reused until marked as a city document",
    );
  }
  const availability = document.availability ?? "active";
  if (availability === "withdrawn") {
    throw new IngestItemError("document_withdrawn");
  }
  if (availability === "superseded") {
    throw new IngestItemError("document_superseded");
  }
}

export function buildIngestExtractPathAInput(
  document: IngestDocumentRecord,
  input: PublishIngestExtractInput,
): RegisterNativeInputInput {
  return {
    kind: INGEST_EXTRACT_CATALOG_KIND,
    owningModule: input.owningModule,
    sourceType: INGEST_EXTRACT_SOURCE_TYPE,
    sourceId: input.sourceId,
    userId: document.uploadedByUserId ?? null,
    inventoryId: input.inventoryId ?? null,
    cityId: document.cityId ?? null,
    projectId: document.projectId ?? null,
    organizationId: document.organizationId ?? null,
    contentDigest: document.contentHash,
    markdownReady: document.markdownReady,
    labels: {
      originalFileName: document.originalFileName,
      documentId: document.id,
    },
  };
}

export function buildIngestDocumentPathBInput(
  document: IngestDocumentRecord,
): RegisterNativeInputInput {
  return {
    kind: INGEST_DOCUMENT_CATALOG_KIND,
    owningModule: INGEST_DOCUMENT_OWNING_MODULE,
    sourceType: INGEST_DOCUMENT_SOURCE_TYPE,
    sourceId: document.id,
    userId: document.uploadedByUserId ?? null,
    cityId: document.cityId ?? null,
    projectId: document.projectId ?? null,
    organizationId: document.organizationId ?? null,
    contentDigest: document.contentHash,
    markdownReady: document.markdownReady,
    labels: {
      originalFileName: document.originalFileName,
      visibility: document.visibility,
    },
  };
}

function isMarkdownFile(fileName: string): boolean {
  const lower = fileName.toLowerCase();
  return lower.endsWith(".md") || lower.endsWith(".markdown");
}

export function initialMarkdownReady(fileName: string): boolean {
  return isMarkdownFile(fileName);
}

export class MemoryIngestDocumentPool implements IngestDocumentPool {
  readonly documents = new Map<string, IngestDocumentRecord>();
  readonly catalogByDocumentId = new Map<string, RegisterNativeInputInput>();
  readonly extractsByDocumentId = new Map<string, RegisterNativeInputInput[]>();
  private readonly byHashScope = new Map<string, string>();

  async store(input: StoreIngestDocumentInput): Promise<{
    document: IngestDocumentRecord;
    created: boolean;
  }> {
    const key = `${input.contentHash}|${scopeKey(input.scope)}`;
    const existingId = this.byHashScope.get(key);
    if (existingId) {
      const existing = this.documents.get(existingId);
      if (!existing) {
        throw new Error(`Ingest document ${existingId} missing`);
      }
      const reusable =
        (existing.availability ?? "active") === "active" && !existing.bytesPurgedAt;
      if (reusable) {
        if (input.s3Key && !existing.s3Key) {
          const withKey = { ...existing, s3Key: input.s3Key };
          this.documents.set(existingId, withKey);
          return { document: { ...withKey, buffer: withKey.buffer }, created: false };
        }
        return { document: { ...existing, buffer: existing.buffer }, created: false };
      }
    }

    const document: IngestDocumentRecord = {
      id: randomUUID(),
      contentHash: input.contentHash,
      originalFileName: input.originalFileName,
      cityId: input.scope.cityId ?? null,
      projectId: input.scope.projectId ?? null,
      organizationId: input.scope.organizationId ?? null,
      uploadedByUserId: input.uploadedByUserId ?? null,
      visibility: input.visibility,
      markdownReady: input.markdownReady ?? initialMarkdownReady(input.originalFileName),
      buffer: input.buffer,
      s3Key: input.s3Key ?? null,
      availability: "active",
      supersededByDocumentId: null,
      withdrawnAt: null,
      bytesPurgedAt: null,
    };
    this.documents.set(document.id, document);
    this.byHashScope.set(key, document.id);
    return { document: { ...document, buffer: document.buffer }, created: true };
  }

  async get(documentId: string): Promise<IngestDocumentRecord | null> {
    const document = this.documents.get(documentId);
    return document ? { ...document, buffer: document.buffer } : null;
  }

  async publishPathB(document: IngestDocumentRecord): Promise<{
    catalogId: string;
    created: boolean;
  }> {
    const existing = this.catalogByDocumentId.get(document.id);
    if (existing && document.catalogId) {
      return { catalogId: document.catalogId, created: false };
    }
    const catalogId = document.catalogId ?? randomUUID();
    this.catalogByDocumentId.set(
      document.id,
      buildIngestDocumentPathBInput(document),
    );
    const current = this.documents.get(document.id);
    if (current) {
      this.documents.set(document.id, { ...current, catalogId });
    }
    return { catalogId, created: !existing };
  }

  async markMarkdownReady(documentId: string): Promise<IngestDocumentRecord> {
    const current = this.documents.get(documentId);
    if (!current) {
      throw new Error(`Ingest document ${documentId} not found`);
    }
    const next = { ...current, markdownReady: true };
    this.documents.set(documentId, next);
    const catalog = this.catalogByDocumentId.get(documentId);
    if (catalog) {
      this.catalogByDocumentId.set(documentId, {
        ...catalog,
        markdownReady: true,
      });
    }
    return { ...next, buffer: next.buffer };
  }

  async publishPathA(
    document: IngestDocumentRecord,
    input: PublishIngestExtractInput,
  ): Promise<{ catalogId: string; created: boolean }> {
    const existing = this.extractsByDocumentId.get(document.id) ?? [];
    const duplicate = existing.find(
      (row) =>
        row.owningModule === input.owningModule &&
        row.sourceId === input.sourceId,
    );
    if (duplicate) {
      return { catalogId: document.catalogId ?? document.id, created: false };
    }
    this.extractsByDocumentId.set(document.id, [
      ...existing,
      buildIngestExtractPathAInput(document, input),
    ]);
    return { catalogId: randomUUID(), created: true };
  }

  async withdraw(
    documentId: string,
    input: WithdrawIngestDocumentInput = {},
  ): Promise<IngestDocumentRecord> {
    const current = this.documents.get(documentId);
    if (!current) {
      throw new IngestItemError("document_not_found");
    }
    const alreadyWithdrawn = (current.availability ?? "active") === "withdrawn";
    const next: IngestDocumentRecord = alreadyWithdrawn
      ? current
      : {
          ...current,
          availability: "withdrawn",
          withdrawnAt: current.withdrawnAt ?? new Date(),
        };
    if (!alreadyWithdrawn) {
      this.documents.set(documentId, next);
      const pathB = this.catalogByDocumentId.get(documentId);
      if (pathB) {
        this.catalogByDocumentId.set(documentId, {
          ...pathB,
          availability: "withdrawn",
        } as RegisterNativeInputInput);
      }
    }
    const modules = new Set(input.withdrawExtractsFor ?? []);
    if (modules.size > 0) {
      const extracts = this.extractsByDocumentId.get(documentId) ?? [];
      this.extractsByDocumentId.set(
        documentId,
        extracts.map((row) =>
          modules.has(row.owningModule as IngestModuleId)
            ? ({ ...row, availability: "withdrawn" } as RegisterNativeInputInput)
            : row,
        ),
      );
    }
    return { ...next, buffer: next.buffer };
  }

  async promoteToCity(documentId: string): Promise<IngestDocumentRecord> {
    const current = this.documents.get(documentId);
    if (!current) {
      throw new IngestItemError("document_not_found");
    }
    const availability = current.availability ?? "active";
    if (availability === "withdrawn") {
      throw new IngestItemError("document_withdrawn");
    }
    if (availability === "superseded") {
      throw new IngestItemError("document_superseded");
    }
    if (current.visibility !== "run" && current.visibility !== "city") {
      throw new IngestItemError(
        "validation_failed",
        "Only a concept-note attachment can be marked as a city document",
      );
    }
    const next: IngestDocumentRecord = { ...current, visibility: "city" };
    this.documents.set(documentId, next);
    const catalog = this.catalogByDocumentId.get(documentId);
    if (catalog) {
      this.catalogByDocumentId.set(documentId, {
        ...catalog,
        labels: { ...(catalog.labels ?? {}), visibility: "city" },
      });
    }
    return { ...next, buffer: next.buffer };
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
    const previous = this.documents.get(documentId);
    if (!previous) {
      throw new IngestItemError("document_not_found");
    }
    assertDocumentReusable(previous);
    const replacement = this.documents.get(replacementDocumentId);
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
    await this.publishPathB(replacement);
    const publishedReplacement = this.documents.get(replacementDocumentId);
    if (!publishedReplacement) {
      throw new IngestItemError("document_not_found");
    }
    const nextPrevious: IngestDocumentRecord = {
      ...previous,
      availability: "superseded",
      supersededByDocumentId: publishedReplacement.id,
    };
    this.documents.set(documentId, nextPrevious);
    const pathB = this.catalogByDocumentId.get(documentId);
    if (pathB) {
      this.catalogByDocumentId.set(documentId, {
        ...pathB,
        availability: "superseded",
        supersededById:
          publishedReplacement.catalogId ?? publishedReplacement.id,
      } as RegisterNativeInputInput);
    }
    return {
      previous: { ...nextPrevious, buffer: nextPrevious.buffer },
      replacement: {
        ...publishedReplacement,
        buffer: publishedReplacement.buffer,
      },
    };
  }
}
