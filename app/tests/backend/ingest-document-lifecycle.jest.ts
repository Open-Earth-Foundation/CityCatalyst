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

async function storeCityDocument(
  name: string,
  bytes: string,
  moduleId: "test" | "ccra" = "test",
) {
  const { store, documentPool, runner } = harness();
  const job = await runner.enqueue({
    moduleId,
    scope: { cityId: CITY_ID },
    files: [{ name, buffer: Buffer.from(bytes) }],
  });
  await runner.run(job.id, new TestIngestPlugin(moduleId));
  const [item] = await store.listItems(job.id);
  const documentId = item?.documentId;
  if (!documentId) throw new Error("expected pooled document");
  return { store, documentPool, runner, documentId };
}

describe("Ingest document withdraw/supersede (CC-958)", () => {
  it("withdraws Path B, keeps Path A, and refuses a new ingest from the id", async () => {
    const { documentPool, runner, documentId } = await storeCityDocument(
      "cap.csv",
      "hello city\n",
    );
    const reuse = await runner.enqueueFromDocument({
      moduleId: "ccra",
      documentId,
      scope: { cityId: CITY_ID },
    });
    await runner.run(reuse.id, new TestIngestPlugin("ccra"));

    const withdrawn = await documentPool.withdraw(documentId);
    const extracts = documentPool.extractsByDocumentId.get(documentId) ?? [];

    expect(withdrawn.availability).toBe("withdrawn");
    expect(
      extracts.every(
        (row) => (row as { availability?: string }).availability !== "withdrawn",
      ),
    ).toBe(true);
    await expect(
      runner.enqueueFromDocument({
        moduleId: "ccra",
        documentId,
        scope: { cityId: CITY_ID },
      }),
    ).rejects.toMatchObject({ code: "document_withdrawn" });
  });

  it("withdraws Path A only for opted-in modules", async () => {
    const { documentPool, runner, documentId } = await storeCityDocument(
      "cap.csv",
      "opt-in extracts\n",
    );
    const job = await runner.enqueueFromDocument({
      moduleId: "ccra",
      documentId,
      scope: { cityId: CITY_ID },
    });
    await runner.run(job.id, new TestIngestPlugin("ccra"));

    await documentPool.withdraw(documentId, {
      withdrawExtractsFor: ["ccra"],
    });
    const extracts = documentPool.extractsByDocumentId.get(documentId) ?? [];
    const byModule = Object.fromEntries(
      extracts.map((row) => [
        row.owningModule,
        (row as { availability?: string }).availability,
      ]),
    );

    expect(byModule.ccra).toBe("withdrawn");
    expect(byModule.test).toBeUndefined();
  });

  it("is idempotent for a second withdraw", async () => {
    const { documentPool, documentId } = await storeCityDocument(
      "cap.csv",
      "once\n",
    );
    const first = await documentPool.withdraw(documentId);
    const second = await documentPool.withdraw(documentId);

    expect(first.availability).toBe("withdrawn");
    expect(second.availability).toBe("withdrawn");
  });

  it("supersedes Path B, keeps Path A, and refuses ingest from the old id", async () => {
    const first = await storeCityDocument("cap.csv", "version one\n");
    const replacementJob = await first.runner.enqueue({
      moduleId: "test",
      scope: { cityId: CITY_ID },
      files: [{ name: "cap-v2.csv", buffer: Buffer.from("version two\n") }],
    });
    await first.runner.run(replacementJob.id, new TestIngestPlugin());
    const [replacementItem] = await first.store.listItems(replacementJob.id);
    const replacementId = replacementItem?.documentId;
    if (!replacementId) throw new Error("expected replacement document");

    const reuse = await first.runner.enqueueFromDocument({
      moduleId: "ccra",
      documentId: first.documentId,
      scope: { cityId: CITY_ID },
    });
    await first.runner.run(reuse.id, new TestIngestPlugin("ccra"));

    const result = await first.documentPool.supersede(
      first.documentId,
      replacementId,
    );
    const extracts =
      first.documentPool.extractsByDocumentId.get(first.documentId) ?? [];

    expect(result.previous.availability).toBe("superseded");
    expect(result.previous.supersededByDocumentId).toBe(replacementId);
    expect(result.replacement.id).toBe(replacementId);
    expect(extracts.length).toBeGreaterThan(0);
    expect(
      extracts.every(
        (row) => (row as { availability?: string }).availability !== "withdrawn",
      ),
    ).toBe(true);
    await expect(
      first.runner.enqueueFromDocument({
        moduleId: "ccra",
        documentId: first.documentId,
        scope: { cityId: CITY_ID },
      }),
    ).rejects.toMatchObject({ code: "document_superseded" });

    const fromReplacement = await first.runner.enqueueFromDocument({
      moduleId: "ccra",
      documentId: replacementId,
      scope: { cityId: CITY_ID },
    });
    expect(fromReplacement.status).toBe("pending");
  });

  it("refuses to supersede a withdrawn document", async () => {
    const first = await storeCityDocument("cap.csv", "gone\n");
    const replacementJob = await first.runner.enqueue({
      moduleId: "test",
      scope: { cityId: CITY_ID },
      files: [{ name: "cap-v2.csv", buffer: Buffer.from("newer\n") }],
    });
    await first.runner.run(replacementJob.id, new TestIngestPlugin());
    const [replacementItem] = await first.store.listItems(replacementJob.id);
    await first.documentPool.withdraw(first.documentId);

    await expect(
      first.documentPool.supersede(
        first.documentId,
        replacementItem?.documentId ?? "",
      ),
    ).rejects.toBeInstanceOf(IngestItemError);
  });
});
