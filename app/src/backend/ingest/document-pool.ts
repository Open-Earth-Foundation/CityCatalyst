import { randomUUID } from "node:crypto";
import type { RegisterNativeInputInput } from "@/backend/NativeInputCatalogService";
import type { IngestScope, IngestVisibility } from "./types";

/** Path B catalog identity for the Core document pool (not a module extract). */
export const INGEST_DOCUMENT_CATALOG_KIND = "ingest_document";
export const INGEST_DOCUMENT_OWNING_MODULE = "ingest";
export const INGEST_DOCUMENT_SOURCE_TYPE = "ingest_document";

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
}

export interface StoreIngestDocumentInput {
  contentHash: string;
  originalFileName: string;
  buffer: Buffer;
  scope: IngestScope;
  uploadedByUserId?: string | null;
  visibility: IngestVisibility;
  markdownReady?: boolean;
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
}

export function scopeKey(scope: IngestScope): string {
  return [
    scope.cityId ?? "",
    scope.projectId ?? "",
    scope.organizationId ?? "",
  ].join("|");
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
      return { document: { ...existing, buffer: existing.buffer }, created: false };
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
}
