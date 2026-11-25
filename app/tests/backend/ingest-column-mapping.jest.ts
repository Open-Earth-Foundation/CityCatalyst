import { describe, expect, it } from "@jest/globals";
import { proposeColumnMap } from "@/backend/ingest/column-mapping";
import { IngestRunner } from "@/backend/ingest/IngestRunner";
import { MemoryIngestStore } from "@/backend/ingest/MemoryIngestStore";
import { MemoryIngestDocumentPool } from "@/backend/ingest/document-pool";
import { TestIngestPlugin } from "@/backend/ingest/plugins/TestIngestPlugin";
import { IngestItemError } from "@/backend/ingest/types";
import type { IngestColumnMappingInput } from "@/backend/ingest/types";
import type { IngestPluginContext } from "@/backend/ingest/plugin";

const CITY_ID = "53f808c2-c218-4d79-a3d8-ff4d3afc8aee";
const INVENTORY_ID = "a3e1c0a0-1111-4b11-8c11-aaaaaaaaaaaa";
const USER_A = "11111111-1111-1111-1111-111111111111";

const TABULAR = "fuel,qty\ndiesel,10\n";

class MappingPlugin extends TestIngestPlugin {
  commitCount = 0;

  columnMapping(
    _ctx: IngestPluginContext,
    parsed: unknown,
  ): IngestColumnMappingInput {
    const [header, ...rows] = String(parsed)
      .split(/\r?\n/)
      .filter((line) => line.length > 0);
    const sourceColumns = (header ?? "").split(",");
    const sampleValues: Record<string, string[]> = {};
    for (const column of sourceColumns) {
      sampleValues[column] = [];
    }
    for (const row of rows) {
      row.split(",").forEach((value, index) => {
        const column = sourceColumns[index];
        if (column) sampleValues[column].push(value);
      });
    }
    return {
      sourceColumns,
      sampleValues,
      taxonomyFields: ["activity", "amount"],
      requiredFields: ["activity", "amount"],
      suggested: { fuel: "activity" },
    };
  }

  async commit(
    ctx: Parameters<TestIngestPlugin["commit"]>[0],
    adapted: unknown,
  ) {
    this.commitCount += 1;
    return super.commit(ctx, adapted);
  }
}

function harness() {
  const store = new MemoryIngestStore();
  const plugin = new MappingPlugin();
  const runner = new IngestRunner(store, new MemoryIngestDocumentPool());
  return { store, plugin, runner };
}

async function mappingItem() {
  const { store, plugin, runner } = harness();
  const job = await runner.enqueue({
    moduleId: "test",
    scope: { cityId: CITY_ID, inventoryId: INVENTORY_ID },
    files: [{ name: "unknown.csv", buffer: Buffer.from(TABULAR) }],
  });
  await runner.run(job.id, plugin);
  const [item] = await store.listItems(job.id);
  if (!item) throw new Error("missing item");
  return { store, plugin, runner, item, job };
}

describe("ingest column mapping (CC-992)", () => {
  it("proposes a map without committing", () => {
    const proposal = proposeColumnMap({
      sourceColumns: ["fuel", "Amount"],
      sampleValues: { fuel: ["diesel"], Amount: ["10"] },
      taxonomyFields: ["activity", "amount"],
      requiredFields: ["activity", "amount"],
      suggested: { fuel: "activity" },
    });
    expect(proposal.columns).toEqual([
      {
        sourceColumn: "fuel",
        taxonomyField: "activity",
        sampleValues: ["diesel"],
        suggestedBy: "model",
      },
      {
        sourceColumn: "Amount",
        taxonomyField: "amount",
        sampleValues: ["10"],
        suggestedBy: "heuristic",
      },
    ]);
  });

  it("stops an unknown tabular file in review with a column map", async () => {
    const { plugin, item } = await mappingItem();

    expect(item.status).toBe("awaiting_review");
    expect(item.stage).toBe("map");
    expect(plugin.commitCount).toBe(0);
    expect(item.reviewDraft?.columnMapping?.status).toBe("pending");
    expect(item.reviewDraft?.columnMapping?.proposal.columns).toEqual([
      {
        sourceColumn: "fuel",
        taxonomyField: "activity",
        sampleValues: ["diesel"],
        suggestedBy: "model",
      },
      {
        sourceColumn: "qty",
        taxonomyField: null,
        sampleValues: ["10"],
        suggestedBy: null,
      },
    ]);
  });

  it("commits only after the user confirms a complete map", async () => {
    const { plugin, runner, item } = await mappingItem();

    const completed = await runner.confirmColumnMapping(item.id, plugin, {
      userId: USER_A,
      reviewDraftVersion: item.reviewDraftVersion ?? 1,
      mappings: [
        { sourceColumn: "fuel", taxonomyField: "activity" },
        { sourceColumn: "qty", taxonomyField: "amount" },
      ],
    });

    expect(plugin.commitCount).toBe(1);
    expect(completed.status).toBe("completed");
    expect(completed.reviewDraft?.columnMapping?.status).toBe("confirmed");
    expect(completed.result).toMatchObject({
      committed: true,
      columnMapping: {
        mappings: [
          { sourceColumn: "fuel", taxonomyField: "activity" },
          { sourceColumn: "qty", taxonomyField: "amount" },
        ],
      },
    });
  });

  it("does not invent a write when the map is incomplete", async () => {
    const { plugin, runner, item, store } = await mappingItem();

    await expect(
      runner.confirmColumnMapping(item.id, plugin, {
        userId: USER_A,
        reviewDraftVersion: item.reviewDraftVersion ?? 1,
        mappings: [{ sourceColumn: "fuel", taxonomyField: "activity" }],
      }),
    ).rejects.toMatchObject({ code: "mapping_incomplete" });

    const still = await store.getItem(item.id);
    expect(still?.status).toBe("awaiting_review");
    expect(plugin.commitCount).toBe(0);
  });

  it("rejects approve until the column map is confirmed", async () => {
    const { plugin, runner, item } = await mappingItem();

    await expect(
      runner.confirmReview(item.id, plugin, {
        userId: USER_A,
        reviewDraftVersion: item.reviewDraftVersion ?? 1,
      }),
    ).rejects.toBeInstanceOf(IngestItemError);
    expect(plugin.commitCount).toBe(0);
  });

  it("skips mapping when the plugin does not ask", async () => {
    const store = new MemoryIngestStore();
    const plugin = new TestIngestPlugin();
    const runner = new IngestRunner(store, new MemoryIngestDocumentPool());
    const job = await runner.enqueue({
      moduleId: "test",
      scope: { cityId: CITY_ID },
      files: [{ name: "notes.csv", buffer: Buffer.from("hello city\n") }],
    });
    await runner.run(job.id, plugin);
    const [item] = await store.listItems(job.id);

    expect(item?.status).toBe("completed");
    expect(item?.reviewDraft?.columnMapping).toBeUndefined();
  });
});
