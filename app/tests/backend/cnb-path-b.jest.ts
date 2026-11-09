import { describe, expect, it } from "@jest/globals";
import { registerCnbUploadOnPool } from "@/backend/ingest/cnb-path-b";
import {
  MemoryIngestDocumentPool,
  assertDocumentReusable,
} from "@/backend/ingest/document-pool";
import {
  isClimateAdvisorObjectKey,
  isWithdrawnBytesDue,
} from "@/backend/ingest/document-retention";
import type { RegisterNativeInputInput } from "@/backend/NativeInputCatalogService";

const CITY_ID = "33333333-3333-4333-8333-333333333333";
const UPLOAD_ID = "44444444-4444-4444-8444-444444444444";

function registry() {
  const catalogs = new Map<string, RegisterNativeInputInput & { id: string }>();
  return {
    catalogs,
    async findCatalog(uploadId: string) {
      const row = catalogs.get(uploadId);
      return row ? { id: row.id } : null;
    },
    async registerCatalog(input: RegisterNativeInputInput) {
      const id = `catalog-${catalogs.size + 1}`;
      catalogs.set(input.sourceId, { ...input, id });
      return { id, created: true };
    },
    async linkCatalog(documentId: string, catalogId: string) {
      const pool = this.pool as MemoryIngestDocumentPool | undefined;
      const document = pool?.documents.get(documentId);
      if (document && !document.catalogId) {
        pool?.documents.set(documentId, { ...document, catalogId });
      }
    },
    pool: undefined as MemoryIngestDocumentPool | undefined,
  };
}

describe("CNB Path B registration", () => {
  it("stores a run-scoped document and a cnb_upload catalog keyed by the CA upload id", async () => {
    const pool = new MemoryIngestDocumentPool();
    const catalogs = registry();
    catalogs.pool = pool;
    const registered = await registerCnbUploadOnPool(
      pool,
      {
        uploadId: UPLOAD_ID,
        cityId: CITY_ID,
        userId: "owner-user",
        filename: "plan.pdf",
        contentHash: "a".repeat(64),
        buffer: Buffer.from("%PDF-1.7"),
        s3Key: `pdf-ocr/sources/concept_note_upload/${UPLOAD_ID}/source.pdf`,
        markdownReady: false,
      },
      catalogs,
    );

    const document = await pool.get(registered.documentId);
    expect(document?.visibility).toBe("run");
    expect(document?.s3Key).toContain(UPLOAD_ID);
    expect(catalogs.catalogs.get(UPLOAD_ID)).toMatchObject({
      kind: "cnb_upload",
      owningModule: "cnb",
      sourceId: UPLOAD_ID,
      labels: { documentId: registered.documentId, visibility: "run" },
    });
    expect(() => assertDocumentReusable(document!)).toThrow(/city document/);
  });

  it("does not create a second catalog row when the same upload id is retried", async () => {
    const pool = new MemoryIngestDocumentPool();
    const catalogs = registry();
    catalogs.pool = pool;
    const input = {
      uploadId: UPLOAD_ID,
      cityId: CITY_ID,
      userId: "owner-user",
      filename: "plan.pdf",
      contentHash: "b".repeat(64),
      buffer: Buffer.from("%PDF-1.7"),
      markdownReady: false,
    };
    const first = await registerCnbUploadOnPool(pool, input, catalogs);
    const second = await registerCnbUploadOnPool(pool, input, catalogs);
    expect(second.created).toBe(false);
    expect(second.catalogId).toBe(first.catalogId);
    expect(catalogs.catalogs.size).toBe(1);
    expect(second.documentId).toBe(first.documentId);
  });

  it("repairs a missing document catalog link when the same upload id is retried", async () => {
    const pool = new MemoryIngestDocumentPool();
    const catalogs = registry();
    catalogs.pool = pool;
    let links = 0;
    const originalLink = catalogs.linkCatalog.bind(catalogs);
    catalogs.linkCatalog = async (documentId, catalogId) => {
      links += 1;
      if (links === 1) return;
      await originalLink(documentId, catalogId);
    };
    const input = {
      uploadId: UPLOAD_ID,
      cityId: CITY_ID,
      userId: "owner-user",
      filename: "plan.pdf",
      contentHash: "e".repeat(64),
      buffer: Buffer.from("%PDF-1.7"),
      markdownReady: false,
    };
    const first = await registerCnbUploadOnPool(pool, input, catalogs);
    expect((await pool.get(first.documentId))?.catalogId ?? null).toBeNull();
    const second = await registerCnbUploadOnPool(pool, input, catalogs);
    expect(second.catalogId).toBe(first.catalogId);
    expect((await pool.get(second.documentId))?.catalogId).toBe(first.catalogId);
  });

  it("stores a new document when the same bytes are uploaded after withdraw", async () => {
    const pool = new MemoryIngestDocumentPool();
    const catalogs = registry();
    catalogs.pool = pool;
    const bytes = {
      cityId: CITY_ID,
      userId: "owner-user",
      filename: "plan.pdf",
      contentHash: "f".repeat(64),
      buffer: Buffer.from("%PDF-1.7"),
      markdownReady: false,
    };
    const first = await registerCnbUploadOnPool(
      pool,
      { ...bytes, uploadId: UPLOAD_ID },
      catalogs,
    );
    await pool.withdraw(first.documentId);
    const second = await registerCnbUploadOnPool(
      pool,
      {
        ...bytes,
        uploadId: "55555555-5555-4555-8555-555555555555",
      },
      catalogs,
    );
    expect(second.documentId).not.toBe(first.documentId);
    expect((await pool.get(second.documentId))?.availability).toBe("active");
    expect((await pool.get(first.documentId))?.availability).toBe("withdrawn");
  });

  it("repairs catalog visibility when promote is retried after a partial update", async () => {
    const pool = new MemoryIngestDocumentPool();
    const catalogs = registry();
    catalogs.pool = pool;
    const registered = await registerCnbUploadOnPool(
      pool,
      {
        uploadId: UPLOAD_ID,
        cityId: CITY_ID,
        userId: "owner-user",
        filename: "notes.md",
        contentHash: "c".repeat(64),
        buffer: Buffer.from("# notes"),
        markdownReady: true,
      },
      catalogs,
    );
    await pool.publishPathB((await pool.get(registered.documentId))!);
    pool.documents.set(registered.documentId, {
      ...(await pool.get(registered.documentId))!,
      visibility: "city",
    });
    const pathB = pool.catalogByDocumentId.get(registered.documentId)!;
    pool.catalogByDocumentId.set(registered.documentId, {
      ...pathB,
      labels: { ...(pathB.labels ?? {}), visibility: "run" },
    });
    expect(
      pool.catalogByDocumentId.get(registered.documentId)?.labels?.visibility,
    ).toBe("run");
    const promoted = await pool.promoteToCity(registered.documentId);
    expect(promoted.visibility).toBe("city");
    expect(
      pool.catalogByDocumentId.get(registered.documentId)?.labels?.visibility,
    ).toBe("city");
  });

  it("promotes a concept-note attachment to a city document other modules can reuse", async () => {
    const pool = new MemoryIngestDocumentPool();
    const catalogs = registry();
    catalogs.pool = pool;
    const registered = await registerCnbUploadOnPool(
      pool,
      {
        uploadId: UPLOAD_ID,
        cityId: CITY_ID,
        userId: "owner-user",
        filename: "notes.md",
        contentHash: "c".repeat(64),
        buffer: Buffer.from("# notes"),
        markdownReady: true,
      },
      catalogs,
    );
    const promoted = await pool.promoteToCity(registered.documentId);
    expect(promoted.visibility).toBe("city");
    expect(() => assertDocumentReusable(promoted)).not.toThrow();
  });
});

describe("withdrawn document byte clock", () => {
  it("purges only after the retention window, and only once", () => {
    const now = new Date("2026-11-05T00:00:00.000Z");
    const recent = new Date("2026-11-04T00:00:00.000Z");
    const old = new Date("2025-11-04T00:00:00.000Z");
    expect(isWithdrawnBytesDue({ withdrawnAt: recent }, now, 365)).toBe(false);
    expect(isWithdrawnBytesDue({ withdrawnAt: old }, now, 365)).toBe(true);
    expect(
      isWithdrawnBytesDue({ withdrawnAt: old, bytesPurgedAt: now }, now, 365),
    ).toBe(false);
    expect(isWithdrawnBytesDue({ withdrawnAt: null }, now, 365)).toBe(false);
  });

  it("starts the retention clock on the first withdraw and does not move it", async () => {
    const pool = new MemoryIngestDocumentPool();
    const { document } = await pool.store({
      contentHash: "d".repeat(64),
      originalFileName: "plan.pdf",
      buffer: Buffer.from("%PDF"),
      scope: { cityId: CITY_ID },
      visibility: "city",
    });
    const withdrawn = await pool.withdraw(document.id);
    const again = await pool.withdraw(document.id);
    expect(withdrawn.withdrawnAt).toBeInstanceOf(Date);
    expect(again.withdrawnAt?.toISOString()).toBe(
      withdrawn.withdrawnAt?.toISOString(),
    );
    expect(withdrawn.bytesPurgedAt ?? null).toBeNull();
  });

  it("does not treat Climate Advisor prefixes as pool-owned objects", () => {
    expect(isClimateAdvisorObjectKey("pdf-ocr/sources/concept_note_upload/x/source.pdf")).toBe(
      true,
    );
    expect(isClimateAdvisorObjectKey("ingest/documents/abc")).toBe(false);
    expect(isClimateAdvisorObjectKey(null)).toBe(false);
  });
});
