import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import GlobalAPIService from "@/backend/GlobalAPIService";
import { buildHiapInventoryContext } from "@/backend/agentic/hiap/context";
import { db } from "@/models";
import {
  ACTION_TYPES,
  HighImpactActionRankingStatus,
  LANGUAGES,
} from "@/util/types";
import { setupTests } from "./helpers";

/**
 * Producer side of the contract between Core's default (unscoped)
 * hiap.inventory.context output and the Concept Note Builder, whose Pydantic
 * models forbid extra fields. The stored fixture is read by the Clima pytest
 * `test_hiap_default_context_contract.py`, which validates it with the real CNB
 * models. Regenerate it with UPDATE_HIAP_CONTRACT_FIXTURE=1.
 */
const FIXTURE_PATH = path.resolve(
  process.cwd(),
  "../climate-advisor/service/tests/fixtures/hiap_default_context.json",
);
const inventoryId = "20000000-0000-4000-8000-000000000001";
const rankingIds = {
  [ACTION_TYPES.Mitigation]: "30000000-0000-4000-8000-000000000001",
  [ACTION_TYPES.Adaptation]: "30000000-0000-4000-8000-000000000002",
};

type CategoryConfig = {
  ranking: boolean;
  count: number;
  selectedRanks: number[];
  unranked: string[];
  explanationBytes: number;
};

const none: CategoryConfig = {
  ranking: false,
  count: 0,
  selectedRanks: [],
  unranked: [],
  explanationBytes: 0,
};

const CASES: Record<string, Record<ACTION_TYPES, CategoryConfig>> = {
  // Selected mitigation (ranked and city-added) plus an adaptation fallback.
  selected_and_fallback: {
    [ACTION_TYPES.Mitigation]: {
      ranking: true,
      count: 6,
      selectedRanks: [2, 5],
      unranked: ["city-added"],
      explanationBytes: 20,
    },
    [ACTION_TYPES.Adaptation]: {
      ranking: true,
      count: 3,
      selectedRanks: [],
      unranked: [],
      explanationBytes: 20,
    },
  },
  // No ranking and no selection anywhere.
  empty: { [ACTION_TYPES.Mitigation]: none, [ACTION_TYPES.Adaptation]: none },
  // One empty category next to a populated one.
  empty_category: {
    [ACTION_TYPES.Mitigation]: {
      ranking: true,
      count: 4,
      selectedRanks: [1],
      unranked: [],
      explanationBytes: 20,
    },
    [ACTION_TYPES.Adaptation]: none,
  },
  // 40 ranked actions with long explanations: far above any byte trim.
  large_fallback: {
    [ACTION_TYPES.Mitigation]: {
      ranking: true,
      count: 40,
      selectedRanks: [],
      unranked: [],
      explanationBytes: 900,
    },
    [ACTION_TYPES.Adaptation]: none,
  },
  // Many selections: the selected projection must stay complete.
  many_selected: {
    [ACTION_TYPES.Mitigation]: {
      ranking: true,
      count: 30,
      selectedRanks: Array.from({ length: 25 }, (_, index) => index + 1),
      unranked: ["city-added-a", "city-added-b"],
      explanationBytes: 900,
    },
    [ACTION_TYPES.Adaptation]: none,
  },
};

function rankedRow(
  type: ACTION_TYPES,
  rank: number,
  selected: boolean,
  bytes: number,
) {
  const attributes = {
    id: `40000000-0000-4000-8000-${String(rank).padStart(12, "0")}`,
    hiaRankingId: rankingIds[type],
    actionId: `${type}-action-${rank}`,
    rank,
    explanation: {
      explanations: { en: `${type} ${rank} `.padEnd(bytes, "e") },
    },
    lang: "en",
    type,
    name: `${type} action ${rank}`,
    isSelected: selected,
    description: `Description ${rank}`,
    sectors: ["Stationary Energy"],
    hazards: [],
    primaryPurposes: ["Mitigation"],
    timelineForImplementation: "<5 years",
    costInvestmentNeeded: "medium",
  };
  return { ...attributes, toJSON: () => attributes };
}

function mockReads(config: Record<ACTION_TYPES, CategoryConfig>) {
  jest
    .spyOn(db.models.HighImpactActionRanking, "findOne")
    .mockImplementation(async (options: never) => {
      const type = (options as { where: { type: ACTION_TYPES } }).where.type;
      return (
        config[type].ranking
          ? {
              id: rankingIds[type],
              status: HighImpactActionRankingStatus.SUCCESS,
              lastUpdated: new Date("2026-07-29T10:00:00Z"),
            }
          : null
      ) as never;
    });
  jest
    .spyOn(db.models.HighImpactActionRanked, "findAll")
    .mockImplementation(async (options: never) => {
      const id = (options as { where: { hiaRankingId: string } }).where
        .hiaRankingId;
      const type = (Object.keys(rankingIds) as ACTION_TYPES[]).find(
        (key) => rankingIds[key] === id,
      )!;
      const { count, selectedRanks, explanationBytes } = config[type];
      return Array.from({ length: count }, (_, index) =>
        rankedRow(
          type,
          index + 1,
          selectedRanks.includes(index + 1),
          explanationBytes,
        ),
      ) as never;
    });
  jest
    .spyOn(db.models.UnrankedActionSelection, "findAll")
    .mockImplementation(async (options: never) => {
      const type = (options as { where: { actionType: ACTION_TYPES } }).where
        .actionType;
      return config[type].unranked.map((actionId) => ({
        actionId,
        lang: "en",
        isSelected: true,
      })) as never;
    });
  jest.spyOn(GlobalAPIService, "fetchAllClimateActions").mockResolvedValue(
    ["city-added", "city-added-a", "city-added-b"].map((ActionID) => ({
      ActionID,
      ActionName: { en: `Name of ${ActionID}` },
      Description: { en: "City-added description" },
      Sector: ["Transportation"],
      PrimaryPurpose: ["Mitigation"],
      TimelineForImplementation: "<5 years",
      CostInvestmentNeeded: "low",
    })) as never,
  );
}

describe("HIAP default context contract with the Concept Note Builder", () => {
  beforeEach(() => {
    setupTests();
  });
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("keeps the default output byte-for-byte as the CNB models expect", async () => {
    const produced: Record<string, unknown> = {};
    for (const [name, config] of Object.entries(CASES)) {
      mockReads(config);
      produced[name] = JSON.parse(
        JSON.stringify(
          await buildHiapInventoryContext(inventoryId, LANGUAGES.en),
        ),
      );
      jest.restoreAllMocks();
    }

    if (process.env.UPDATE_HIAP_CONTRACT_FIXTURE === "1") {
      mkdirSync(path.dirname(FIXTURE_PATH), { recursive: true });
      writeFileSync(
        FIXTURE_PATH,
        `${JSON.stringify(produced, null, 2)}\n`,
        "utf8",
      );
    }
    expect(existsSync(FIXTURE_PATH)).toBe(true);
    expect(produced).toEqual(JSON.parse(readFileSync(FIXTURE_PATH, "utf8")));
  });

  it("never adds paging fields or trims the default projection", async () => {
    mockReads(CASES.many_selected);
    const data = await buildHiapInventoryContext(inventoryId, LANGUAGES.en);
    const mitigation = data.mitigation!;

    expect(Object.keys(mitigation).sort()).toEqual([
      "actions",
      "counts",
      "language",
      "ranking_id",
      "selection_mode",
      "status",
      "updated_at",
    ]);
    expect(Object.keys(mitigation.counts).sort()).toEqual([
      "ranked",
      "returned",
      "selected",
    ]);
    // 25 ranked + 2 city-added selections, each large: well above 24 KB.
    expect(mitigation.actions).toHaveLength(27);
    expect(mitigation.counts).toEqual({
      ranked: 30,
      selected: 27,
      returned: 27,
    });
    expect(
      Buffer.byteLength(JSON.stringify(mitigation.actions)),
    ).toBeGreaterThan(24 * 1024);
  });

  it("emits paging fields only when scope, limit or offset is asked for", async () => {
    mockReads(CASES.selected_and_fallback);

    for (const options of [
      { scope: "ranked" as const },
      { limit: 2 },
      { offset: 1 },
      { scope: "selected" as const },
    ]) {
      const data = await buildHiapInventoryContext(
        inventoryId,
        LANGUAGES.en,
        options,
      );
      expect(data.mitigation).toHaveProperty("truncated");
      expect(data.mitigation!.counts).toHaveProperty("total");
      expect(data.mitigation!.counts).toHaveProperty("offset");
    }
  });
});
