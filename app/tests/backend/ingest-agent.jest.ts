import { describe, expect, it } from "@jest/globals";
import { IngestAgent } from "@/backend/ingest/agent";
import { IngestRunner } from "@/backend/ingest/IngestRunner";
import { MemoryIngestStore } from "@/backend/ingest/MemoryIngestStore";
import { MemoryIngestDocumentPool } from "@/backend/ingest/document-pool";
import { TestIngestPlugin } from "@/backend/ingest/plugins/TestIngestPlugin";
import { GhgiIngestPlugin } from "@/backend/ingest/plugins/GhgiIngestPlugin";
import type { ECRFImportResult } from "@/backend/ECRFImportService";
import type { ValidationResult } from "@/backend/FileValidatorService";

const CITY_ID = "53f808c2-c218-4d79-a3d8-ff4d3afc8aee";
const INVENTORY_ID = "a3e1c0a0-1111-4b11-8c11-aaaaaaaaaaaa";
const USER_A = "11111111-1111-1111-1111-111111111111";

class ReviewPlugin extends TestIngestPlugin {
  commitCount = 0;
  approvalPolicy(): "review" {
    return "review";
  }
  async commit(
    ctx: Parameters<TestIngestPlugin["commit"]>[0],
    adapted: unknown,
  ) {
    this.commitCount += 1;
    return super.commit(ctx, adapted);
  }
}

function ecrfValidation(): ValidationResult {
  return {
    isValid: true,
    errors: [],
    warnings: [],
    fileType: "xlsx",
    detectedColumns: { gpcRefNo: 0, sector: 1, subsector: 2, scope: 3 },
  };
}

function ecrfResult(): ECRFImportResult {
  return {
    rows: [
      {
        gpcRefNo: "I.1.1",
        sectorId: "s",
        subsectorId: "ss",
        subcategoryId: null,
        scopeId: "1",
        totalCO2e: 1,
        rowIndex: 0,
      },
    ],
    errors: [],
    warnings: [],
    rowCount: 1,
    validRowCount: 1,
  };
}

function agentHarness(plugin?: TestIngestPlugin) {
  const store = new MemoryIngestStore();
  const runner = new IngestRunner(store, new MemoryIngestDocumentPool());
  const agent = new IngestAgent(runner, store);
  return { store, runner, agent, plugin };
}

describe("ingest agent capabilities (CC-993)", () => {
  it("starts a GHGI eCRF job and auto-commits inside the runner", async () => {
    const imported: string[] = [];
    const plugin = new GhgiIngestPlugin({
      validateStructure: async () => ecrfValidation(),
      buildImportResult: async () => ecrfResult(),
      importEcrf: async (inventoryId) => {
        imported.push(inventoryId);
        return {
          totalRows: 1,
          importedRows: 1,
          skippedRows: 0,
          errors: [],
          warnings: [],
        };
      },
    });
    const { agent } = agentHarness();
    const started = await agent.start({
      moduleId: "ghgi",
      plugin,
      userId: USER_A,
      scope: { cityId: CITY_ID, inventoryId: INVENTORY_ID },
      files: [{ name: "city.xlsx", buffer: Buffer.from("ecrf") }],
    });

    expect(started.job.status).toBe("completed");
    expect(imported).toEqual([INVENTORY_ID]);
    expect(JSON.stringify(started)).not.toMatch(/s3/i);
    expect(started.items[0]?.status).toBe("completed");
  });

  it("returns awaiting-review status without buffers or S3 keys", async () => {
    const plugin = new ReviewPlugin();
    const { agent } = agentHarness(plugin);
    const started = await agent.start({
      moduleId: "test",
      plugin,
      userId: USER_A,
      scope: { cityId: CITY_ID, inventoryId: INVENTORY_ID },
      files: [{ name: "notes.csv", buffer: Buffer.from("hello city\n") }],
    });

    expect(started.job.status).toBe("awaiting_review");
    expect(started.items[0]?.status).toBe("awaiting_review");
    expect(started.items[0]?.reviewSummary).toEqual({ text: "hello city\n" });
    expect(plugin.commitCount).toBe(0);
    expect(started.items[0]).not.toHaveProperty("buffer");
    expect(JSON.stringify(started)).not.toMatch(/BEGIN PRIVATE KEY/);
  });

  it("confirms once through the plugin commit", async () => {
    const plugin = new ReviewPlugin();
    const { agent } = agentHarness(plugin);
    const started = await agent.start({
      moduleId: "test",
      plugin,
      userId: USER_A,
      scope: { cityId: CITY_ID, inventoryId: INVENTORY_ID },
      files: [{ name: "notes.csv", buffer: Buffer.from("hello city\n") }],
    });
    const item = started.items[0];
    if (!item) throw new Error("missing item");

    const confirmed = await agent.confirm({
      itemId: item.id,
      userId: USER_A,
      reviewDraftVersion: item.reviewDraftVersion ?? 1,
      plugin,
    });

    expect(plugin.commitCount).toBe(1);
    expect(confirmed.job.status).toBe("completed");
    expect(confirmed.items[0]?.status).toBe("completed");
  });
});
