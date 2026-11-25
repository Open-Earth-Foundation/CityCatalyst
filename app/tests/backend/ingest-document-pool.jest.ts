import { describe, expect, it } from "@jest/globals";
import { IngestRunner } from "@/backend/ingest/IngestRunner";
import { MemoryIngestStore } from "@/backend/ingest/MemoryIngestStore";
import {
  INGEST_DOCUMENT_CATALOG_KIND,
  INGEST_DOCUMENT_OWNING_MODULE,
  MemoryIngestDocumentPool,
} from "@/backend/ingest/document-pool";
import { TestIngestPlugin } from "@/backend/ingest/plugins/TestIngestPlugin";

const CITY_ID = "53f808c2-c218-4d79-a3d8-ff4d3afc8aee";

function harness() {
  const store = new MemoryIngestStore();
  const documentPool = new MemoryIngestDocumentPool();
  return {
    store,
    documentPool,
    runner: new IngestRunner(store, documentPool),
    plugin: new TestIngestPlugin(),
  };
}

describe("Ingest document pool Path B (CC-955)", () => {
  it("registers a Path B catalog row at store, before module commit", async () => {
    const { store, documentPool, runner, plugin } = harness();
    const job = await runner.enqueue({
      moduleId: "test",
      scope: { cityId: CITY_ID },
      uploadedByUserId: "user-1",
      files: [{ name: "notes.csv", buffer: Buffer.from("hello city\n") }],
    });
    await runner.run(job.id, plugin);
    const [item] = await store.listItems(job.id);
    const document = await documentPool.get(item?.documentId ?? "");
    const catalog = documentPool.catalogByDocumentId.get(document?.id ?? "");

    expect(document?.contentHash).toHaveLength(64);
    expect(document?.cityId).toBe(CITY_ID);
    expect(document?.markdownReady).toBe(false);
    expect(catalog?.kind).toBe(INGEST_DOCUMENT_CATALOG_KIND);
    expect(catalog?.owningModule).toBe(INGEST_DOCUMENT_OWNING_MODULE);
    expect(catalog?.sourceId).toBe(document?.id);
    expect(catalog?.markdownReady).toBe(false);
    expect(item?.result).toMatchObject({ committed: true });
  });

  it("reuses the same pool row for the same content hash and city", async () => {
    const { documentPool, runner, plugin } = harness();
    const files = [{ name: "notes.csv", buffer: Buffer.from("same bytes") }];
    const first = await runner.enqueue({
      moduleId: "test",
      scope: { cityId: CITY_ID },
      files,
    });
    await runner.run(first.id, plugin);
    const second = await runner.enqueue({
      moduleId: "test",
      scope: { cityId: CITY_ID },
      files,
    });
    await runner.run(second.id, plugin);

    expect(documentPool.documents.size).toBe(1);
    expect(documentPool.catalogByDocumentId.size).toBe(1);
  });

  it("sets markdownReady on the Path B row without a Path A extract", async () => {
    const { store, documentPool, runner, plugin } = harness();
    const job = await runner.enqueue({
      moduleId: "test",
      scope: { cityId: CITY_ID },
      files: [{ name: "notes.csv", buffer: Buffer.from("ocr me") }],
    });
    await runner.run(job.id, plugin);
    const [item] = await store.listItems(job.id);
    const updated = await documentPool.markMarkdownReady(item?.documentId ?? "");
    const catalog = documentPool.catalogByDocumentId.get(updated.id);

    expect(updated.markdownReady).toBe(true);
    expect(catalog?.markdownReady).toBe(true);
    expect(catalog?.kind).toBe(INGEST_DOCUMENT_CATALOG_KIND);
  });

  it("keeps Path B when later format detect fails", async () => {
    const { store, documentPool, runner, plugin } = harness();
    const job = await runner.enqueue({
      moduleId: "test",
      scope: { cityId: CITY_ID },
      files: [{ name: "scan.pdf", buffer: Buffer.from("%PDF") }],
    });
    await runner.run(job.id, plugin);
    const [item] = await store.listItems(job.id);

    expect(item?.status).toBe("failed");
    expect(item?.documentId).toBeTruthy();
    expect(documentPool.catalogByDocumentId.size).toBe(1);
  });
});
