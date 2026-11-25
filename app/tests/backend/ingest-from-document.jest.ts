import { describe, expect, it } from "@jest/globals";
import { IngestRunner } from "@/backend/ingest/IngestRunner";
import { MemoryIngestStore } from "@/backend/ingest/MemoryIngestStore";
import { MemoryIngestDocumentPool } from "@/backend/ingest/document-pool";
import { TestIngestPlugin } from "@/backend/ingest/plugins/TestIngestPlugin";
import { IngestItemError } from "@/backend/ingest/types";

const CITY_ID = "53f808c2-c218-4d79-a3d8-ff4d3afc8aee";

function harness() {
  const store = new MemoryIngestStore();
  const documentPool = new MemoryIngestDocumentPool();
  return {
    store,
    documentPool,
    runner: new IngestRunner(store, documentPool),
  };
}

async function storeCityDocument() {
  const { store, documentPool, runner } = harness();
  const job = await runner.enqueue({
    moduleId: "test",
    scope: { cityId: CITY_ID },
    files: [{ name: "cap.csv", buffer: Buffer.from("hello city\n") }],
  });
  await runner.run(job.id, new TestIngestPlugin("test"));
  const [item] = await store.listItems(job.id);
  const documentId = item?.documentId;
  if (!documentId) throw new Error("expected pooled document");
  return { store, documentPool, runner, documentId, item };
}

describe("Ingest from existing document (CC-957)", () => {
  it("reuses Path B bytes, skips a second pool row, and adds a Path A extract", async () => {
    const { store, documentPool, runner, documentId } = await storeCityDocument();
    const pathBCount = documentPool.catalogByDocumentId.size;

    const job = await runner.enqueueFromDocument({
      moduleId: "ccra",
      documentId,
      scope: { cityId: CITY_ID },
    });
    const finished = await runner.run(job.id, new TestIngestPlugin("ccra"));
    const items = await store.listItems(job.id);
    const extracts = documentPool.extractsByDocumentId.get(documentId) ?? [];

    expect(finished.status).toBe("completed");
    expect(items[0]?.documentId).toBe(documentId);
    expect(documentPool.documents.size).toBe(1);
    expect(documentPool.catalogByDocumentId.size).toBe(pathBCount);
    expect(extracts.map((row) => row.owningModule).sort()).toEqual([
      "ccra",
      "test",
    ]);
    expect(extracts.every((row) => row.contentDigest?.length === 64)).toBe(
      true,
    );
    expect(extracts.every((row) => row.kind === "ingest_extract")).toBe(true);
  });

  it("refuses withdrawn and superseded documents", async () => {
    const { documentPool, runner, documentId } = await storeCityDocument();
    const document = documentPool.documents.get(documentId);
    if (!document) throw new Error("missing document");

    documentPool.documents.set(documentId, {
      ...document,
      availability: "withdrawn",
    });
    await expect(
      runner.enqueueFromDocument({
        moduleId: "ccra",
        documentId,
        scope: { cityId: CITY_ID },
      }),
    ).rejects.toMatchObject({ code: "document_withdrawn" });

    documentPool.documents.set(documentId, {
      ...document,
      availability: "superseded",
    });
    await expect(
      runner.enqueueFromDocument({
        moduleId: "ccra",
        documentId,
        scope: { cityId: CITY_ID },
      }),
    ).rejects.toMatchObject({ code: "document_superseded" });
  });

  it("refuses run-scoped concept-note attachments", async () => {
    const { documentPool, runner, documentId } = await storeCityDocument();
    const document = documentPool.documents.get(documentId);
    if (!document) throw new Error("missing document");
    documentPool.documents.set(documentId, {
      ...document,
      visibility: "run",
    });

    await expect(
      runner.enqueueFromDocument({
        moduleId: "ghgi",
        documentId,
        scope: { cityId: CITY_ID },
      }),
    ).rejects.toMatchObject({ code: "document_unavailable" });
  });

  it("fails closed when the document id is missing", async () => {
    const { runner } = harness();
    await expect(
      runner.enqueueFromDocument({
        moduleId: "test",
        documentId: "00000000-0000-0000-0000-000000000000",
        scope: { cityId: CITY_ID },
      }),
    ).rejects.toBeInstanceOf(IngestItemError);
  });
});
