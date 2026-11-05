import { describe, expect, it } from "@jest/globals";
import { IngestRunner } from "@/backend/ingest/IngestRunner";
import { MemoryIngestStore } from "@/backend/ingest/MemoryIngestStore";
import { MemoryIngestDocumentPool } from "@/backend/ingest/document-pool";
import { TestIngestPlugin } from "@/backend/ingest/plugins/TestIngestPlugin";
import { reconcileIngestSource } from "@/backend/ingest/source-reconciliation";
import { IngestItemError } from "@/backend/ingest/types";

const CITY_ID = "53f808c2-c218-4d79-a3d8-ff4d3afc8aee";
const USER_A = "11111111-1111-1111-1111-111111111111";

function pointer(row: number) {
  return { file: "notes.csv", row };
}

function harness() {
  const store = new MemoryIngestStore();
  const runner = new IngestRunner(store, new MemoryIngestDocumentPool());
  return { store, runner, plugin: new TestIngestPlugin() };
}

async function runCsv(body: string) {
  const { store, runner, plugin } = harness();
  const job = await runner.enqueue({
    moduleId: "test",
    scope: { cityId: CITY_ID },
    files: [{ name: "notes.csv", buffer: Buffer.from(body) }],
  });
  const finished = await runner.run(job.id, plugin);
  const [item] = await store.listItems(job.id);
  return { store, runner, plugin, finished, item };
}

describe("reconcileIngestSource", () => {
  it("passes when every occupancy row is imported or skipped with a reason", () => {
    const report = reconcileIngestSource({
      sourceRowCount: 2,
      occupancy: [
        { pointer: pointer(1), raw: "a" },
        { pointer: pointer(2), raw: "b" },
      ],
      proposed: [{ pointer: pointer(1), raw: "a" }],
      skipped: [{ pointer: pointer(2), reason: "empty" }],
    });

    expect(report.ok).toBe(true);
    expect(report.importedCount).toBe(1);
    expect(report.skippedCount).toBe(1);
  });

  it("fails extra, missing, and skip-without-reason rows", () => {
    const extra = reconcileIngestSource({
      sourceRowCount: 1,
      occupancy: [{ pointer: pointer(1), raw: "a" }],
      proposed: [
        { pointer: pointer(1), raw: "a" },
        { pointer: pointer(9), raw: "ghost" },
      ],
      skipped: [],
    });
    const missing = reconcileIngestSource({
      sourceRowCount: 2,
      occupancy: [
        { pointer: pointer(1), raw: "a" },
        { pointer: pointer(2), raw: "b" },
      ],
      proposed: [{ pointer: pointer(1), raw: "a" }],
      skipped: [],
    });
    const skip = reconcileIngestSource({
      sourceRowCount: 1,
      occupancy: [{ pointer: pointer(1), raw: "a" }],
      proposed: [],
      skipped: [{ pointer: pointer(1), reason: "  " }],
    });

    expect(extra.issues.map((issue) => issue.code)).toContain("extra_value");
    expect(missing.issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining(["missing_row", "count_mismatch"]),
    );
    expect(skip.issues.map((issue) => issue.code)).toContain(
      "skip_without_reason",
    );
    expect(extra.ok).toBe(false);
    expect(missing.ok).toBe(false);
    expect(skip.ok).toBe(false);
  });
});

describe("Ingest source reconciliation (CC-990)", () => {
  it("commits only values that exist in a clean file", async () => {
    const { finished, item } = await runCsv("hello city\n");

    expect(finished.status).toBe("completed");
    expect(item?.status).toBe("completed");
    expect(item?.result?.reconciliation).toMatchObject({
      ok: true,
      importedCount: 1,
      skippedCount: 0,
    });
  });

  it("keeps extra, missing, and skip-without-reason files reviewable and does not commit", async () => {
    const extra = await runCsv("kind,raw,reason\nimport,a,\nextra,ghost,\n");
    const missing = await runCsv("kind,raw,reason\nimport,a,\nsource,b,\n");
    const skip = await runCsv("kind,raw,reason\nskip,,\n");

    expect(extra.item?.status).toBe("awaiting_review");
    expect(extra.item?.result?.reconciliation).toMatchObject({ ok: false });
    expect(
      (extra.item?.result?.reconciliation as { issues: { code: string }[] })
        .issues,
    ).toEqual(expect.arrayContaining([expect.objectContaining({ code: "extra_value" })]));
    expect(missing.item?.status).toBe("awaiting_review");
    expect(skip.item?.status).toBe("awaiting_review");
    expect(extra.item?.reviewDraft?.reconciliation?.ok).toBe(false);
  });

  it("accounts skipped rows with a reason and still commits the rest", async () => {
    const { item } = await runCsv("kind,raw,reason\nimport,keep,\nskip,,empty\n");

    expect(item?.status).toBe("completed");
    expect(item?.result?.reconciliation).toMatchObject({
      ok: true,
      importedCount: 1,
      skippedCount: 1,
    });
  });

  it("blocks confirm while the stored bundle still fails accounting", async () => {
    const { runner, plugin, item } = await runCsv(
      "kind,raw,reason\nimport,a,\nextra,ghost,\n",
    );
    await runner.getReviewDraft(item!.id, USER_A);

    await expect(
      runner.confirmReview(item!.id, plugin, {
        userId: USER_A,
        reviewDraftVersion: 1,
      }),
    ).rejects.toMatchObject({ code: "reconciliation_failed" });
  });
});
