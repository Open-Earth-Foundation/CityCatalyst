import { describe, expect, it } from "@jest/globals";
import JSZip from "jszip";
import { IngestRunner } from "@/backend/ingest/IngestRunner";
import { MemoryIngestStore } from "@/backend/ingest/MemoryIngestStore";
import { MemoryIngestDocumentPool } from "@/backend/ingest/document-pool";
import { TestIngestPlugin } from "@/backend/ingest/plugins/TestIngestPlugin";
import { IngestItemError } from "@/backend/ingest/types";

const CITY_ID = "53f808c2-c218-4d79-a3d8-ff4d3afc8aee";

function runner() {
  const store = new MemoryIngestStore();
  const documentPool = new MemoryIngestDocumentPool();
  return {
    store,
    documentPool,
    runner: new IngestRunner(store, documentPool),
    plugin: new TestIngestPlugin(),
  };
}

async function zipOf(files: Record<string, string>): Promise<Buffer> {
  const zip = new JSZip();
  for (const [name, body] of Object.entries(files)) {
    zip.file(name, body);
  }
  return Buffer.from(await zip.generateAsync({ type: "uint8array" }));
}

describe("IngestRunner", () => {
  it("runs one file through the test plugin without a module SoT write", async () => {
    const { store, runner: ingest, plugin } = runner();
    const job = await ingest.enqueue({
      moduleId: "test",
      scope: { cityId: CITY_ID },
      uploadedByUserId: "user-1",
      files: [{ name: "notes.csv", buffer: Buffer.from("hello city\n") }],
    });

    const finished = await ingest.run(job.id, plugin);
    const items = await store.listItems(job.id);

    expect(finished.status).toBe("completed");
    expect(finished.completedCount).toBe(1);
    expect(items).toHaveLength(1);
    expect(items[0]?.status).toBe("completed");
    expect(items[0]?.stage).toBe("publish");
    expect(items[0]?.contentHash).toHaveLength(64);
    expect(items[0]?.coarseKind).toBe("csv");
    expect(items[0]?.documentId).toBeTruthy();
    expect(items[0]?.result).toMatchObject({
      committed: true,
      preview: "hello city",
      lineCount: 1,
    });
  });

  it("expands a zip into one item per inner file", async () => {
    const { store, runner: ingest, plugin } = runner();
    const buffer = await zipOf({
      "a.csv": "alpha",
      "nested/b.csv": "sector,value\nstationary,1\n",
    });
    const job = await ingest.enqueue({
      moduleId: "test",
      scope: { cityId: CITY_ID },
      files: [{ name: "bundle.zip", buffer }],
    });
    const finished = await ingest.run(job.id, plugin);
    const items = await store.listItems(job.id);

    expect(job.totalCount).toBe(2);
    expect(finished.completedCount).toBe(2);
    expect(items.map((item) => item.originalFileName).sort()).toEqual([
      "a.csv",
      "b.csv",
    ]);
    expect(items.every((item) => item.status === "completed")).toBe(true);
  });

  it("skips commit and catalog on dryRun", async () => {
    const { store, documentPool, runner: ingest, plugin } = runner();
    const job = await ingest.enqueue({
      moduleId: "test",
      dryRun: true,
      scope: { cityId: CITY_ID },
      files: [{ name: "notes.csv", buffer: Buffer.from("keep") }],
    });
    const finished = await ingest.run(job.id, plugin);
    const [item] = await store.listItems(job.id);

    expect(finished.status).toBe("completed");
    expect(finished.skippedCount).toBe(1);
    expect(item?.status).toBe("skipped");
    expect(item?.errorCode).toBe("dry_run");
    expect(item?.result).toBeUndefined();
    expect(item?.documentId).toBeUndefined();
    expect(documentPool.documents.size).toBe(0);
    expect(documentPool.catalogByDocumentId.size).toBe(0);
  });

  it.each(["scan.pdf", "sheet.xlsx", "notes.md", "notes.txt", "scan.exe"])(
    "rejects %s at Core coarse detect before plugin format detect",
    async (name) => {
      const { store, runner: ingest, plugin } = runner();
      const job = await ingest.enqueue({
        moduleId: "test",
        scope: { cityId: CITY_ID },
        files: [{ name, buffer: Buffer.from("payload") }],
      });
      const finished = await ingest.run(job.id, plugin);
      const [item] = await store.listItems(job.id);

      expect(finished.status).toBe("failed");
      expect(item?.status).toBe("failed");
      expect(item?.errorCode).toBe("unsupported_extension");
      expect(item?.coarseKind).toBeDefined();
      expect(item?.result).toBeUndefined();
    },
  );

  it("merges match and validate warnings instead of replacing", async () => {
    const { store, runner: ingest } = runner();
    class WarningPlugin extends TestIngestPlugin {
      match() {
        return { warnings: ["year_mismatch"] };
      }
      async validate() {
        return { warnings: ["import_warning", "year_mismatch"] };
      }
    }
    const job = await ingest.enqueue({
      moduleId: "test",
      scope: { cityId: CITY_ID },
      files: [{ name: "notes.csv", buffer: Buffer.from("hello city\n") }],
    });
    await ingest.run(job.id, new WarningPlugin());
    const [item] = await store.listItems(job.id);

    expect(item?.warnings).toEqual(["year_mismatch", "import_warning"]);
  });

  it("rejects enqueue without a city/org/project scope", async () => {
    const { runner: ingest } = runner();
    await expect(
      ingest.enqueue({
        moduleId: "test",
        scope: {},
        files: [{ name: "a.csv", buffer: Buffer.from("x") }],
      }),
    ).rejects.toBeInstanceOf(IngestItemError);
  });
});
