import {
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";

const findRanking = jest.fn<(id: string) => Promise<unknown>>();
const findRanked = jest.fn<(options: unknown) => Promise<unknown[]>>();
const findRemoved = jest.fn<(options: unknown) => Promise<unknown[]>>();
const findReport = jest.fn<(id: string) => Promise<unknown>>();
const findInventory = jest.fn<(id: string) => Promise<unknown>>();

jest.unstable_mockModule("@/models", () => ({
  db: {
    models: {
      MeedRanking: { findByPk: (id: string) => findRanking(id) },
      MeedActionRanked: { findAll: (o: unknown) => findRanked(o) },
      MeedActionRemoved: { findAll: (o: unknown) => findRemoved(o) },
      MeedActionReport: { findByPk: (id: string) => findReport(id) },
      Inventory: { findByPk: (id: string) => findInventory(id) },
    },
  },
}));

import {
  HIAP_MEED_OUTPUT_PLAN_CONTEXT_CAPABILITY,
  HIAP_MEED_RANKING_CONTEXT_CAPABILITY,
} from "@/backend/agentic/hiap-meed/registry";

let buildMeedOutputPlanContext: typeof import("@/backend/agentic/hiap-meed/context").buildMeedOutputPlanContext;
let buildMeedRankingContext: typeof import("@/backend/agentic/hiap-meed/context").buildMeedRankingContext;
let getNativeInputCapabilityDefinition: typeof import("@/backend/agentic/native-input-catalog/registry").getNativeInputCapabilityDefinition;
let getNativeInputSourceAdapter: typeof import("@/backend/agentic/native-input-catalog/source-adapters").getNativeInputSourceAdapter;

beforeAll(async () => {
  ({ buildMeedOutputPlanContext, buildMeedRankingContext } =
    await import("@/backend/agentic/hiap-meed/context"));
  ({ getNativeInputCapabilityDefinition } =
    await import("@/backend/agentic/native-input-catalog/registry"));
  ({ getNativeInputSourceAdapter } =
    await import("@/backend/agentic/native-input-catalog/source-adapters"));
});

describe("HIAP-MEED native input capabilities", () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  it.each([
    ["hiap_meed_ranking", HIAP_MEED_RANKING_CONTEXT_CAPABILITY],
    ["hiap_meed_output_plan", HIAP_MEED_OUTPUT_PLAN_CONTEXT_CAPABILITY],
  ])("registers %s with its capability and an adapter", (kind, capability) => {
    const key = {
      owningModule: "hiap_meed",
      kind,
      sourceType: kind,
    };

    expect(getNativeInputCapabilityDefinition(key)?.capabilityIds).toEqual([
      capability,
    ]);
    expect(
      getNativeInputSourceAdapter({ id: "catalog-1", ...key }),
    ).not.toBeNull();
  });

  it("returns ranked actions in rank order with the localized explanation", async () => {
    findRanking.mockResolvedValue({
      id: "r1",
      status: "completed",
      created: new Date("2026-10-01T00:00:00Z"),
    });
    findRanked.mockResolvedValue([
      {
        rank: 1,
        actionId: "t1",
        finalScore: 0.9,
        explanations: { en: "English", pt: "Portugues" },
      },
    ]);
    findRemoved.mockResolvedValue([
      { actionId: "t9", actionName: "Removed", removalReason: "legal" },
    ]);

    const context = await buildMeedRankingContext("r1", "pt");

    expect(findRanked).toHaveBeenCalledWith(
      expect.objectContaining({ order: [["rank", "ASC"]] }),
    );
    expect(context).toMatchObject({
      status: "available",
      counts: { ranked: 1, removed: 1, returned: 1 },
      ranked_actions: [{ rank: 1, action_id: "t1", explanation: "Portugues" }],
      removed_actions: [{ action_name: "Removed", removal_reason: "legal" }],
    });
  });

  it("returns nothing for a ranking that is missing or not completed", async () => {
    findRanking.mockResolvedValueOnce(null);
    findRanking.mockResolvedValueOnce({ id: "r2", status: "failed" });

    await expect(buildMeedRankingContext("r1", "en")).resolves.toBeNull();
    await expect(buildMeedRankingContext("r2", "en")).resolves.toBeNull();
  });

  it("returns an output plan and degrades to chapter keys when it is too large", async () => {
    findReport.mockResolvedValueOnce({
      actionId: "t1",
      languages: ["en"],
      chapters: { intro: "short" },
    });
    findReport.mockResolvedValueOnce({
      actionId: "t1",
      languages: ["en"],
      chapters: { intro: "x".repeat(50 * 1024) },
    });

    const small = await buildMeedOutputPlanContext("p1");
    const large = await buildMeedOutputPlanContext("p2");

    expect(small).toMatchObject({
      truncated: false,
      chapters: { intro: "short" },
    });
    expect(large).toMatchObject({
      truncated: true,
      chapters: null,
      chapter_keys: ["intro"],
    });
  });

  describe("source adapter", () => {
    const entry = {
      id: "catalog-1",
      kind: "hiap_meed_ranking",
      owningModule: "hiap_meed",
      sourceType: "hiap_meed_ranking",
      sourceId: "ranking-1",
      inventoryId: "inventory-1",
    };
    let adapter: NonNullable<ReturnType<typeof getNativeInputSourceAdapter>>;

    beforeAll(() => {
      adapter = getNativeInputSourceAdapter(entry)!;
    });

    it("is ready only for a mapped entry with a source and an existing inventory", async () => {
      findInventory.mockResolvedValue({ inventoryId: "inventory-1" });

      await expect(adapter.probeReadiness(entry)).resolves.toBe(true);
      await expect(
        adapter.probeReadiness({ ...entry, sourceId: null }),
      ).resolves.toBe(false);
      await expect(
        adapter.probeReadiness({ ...entry, inventoryId: null }),
      ).resolves.toBe(false);
      await expect(
        adapter.probeReadiness({ ...entry, owningModule: "hiap" }),
      ).resolves.toBe(false);
      await expect(
        adapter.probeReadiness({ ...entry, kind: "unmapped" }),
      ).resolves.toBe(false);
    });

    it("is not ready when the inventory no longer exists", async () => {
      findInventory.mockResolvedValue(null);

      await expect(adapter.probeReadiness(entry)).resolves.toBe(false);
    });

    it("executes the ranking capability from the entry source and ignores caller IDs", async () => {
      findRanking.mockResolvedValue({ id: "ranking-1", status: "completed" });
      findRanked.mockResolvedValue([{ rank: 1, actionId: "t1" }]);
      findRemoved.mockResolvedValue([]);

      const result = await adapter.executeSelected({
        entry,
        capabilityId: HIAP_MEED_RANKING_CONTEXT_CAPABILITY,
        input: {
          city_id: "00000000-0000-4000-8000-000000000001",
          inventory_id: "00000000-0000-4000-8000-000000000002",
          language: "en",
        },
      });

      expect(findRanking).toHaveBeenCalledWith("ranking-1");
      expect(result).toMatchObject({ status: "available" });
    });

    it("returns nothing for a ranking that is not completed or an entry without a source", async () => {
      findRanking.mockResolvedValue({ id: "ranking-1", status: "failed" });
      const input = {
        city_id: "00000000-0000-4000-8000-000000000001",
        inventory_id: "00000000-0000-4000-8000-000000000002",
        language: "en",
      };

      await expect(
        adapter.executeSelected({
          entry,
          capabilityId: HIAP_MEED_RANKING_CONTEXT_CAPABILITY,
          input,
        }),
      ).resolves.toBeNull();
      await expect(
        adapter.executeSelected({
          entry: { ...entry, sourceId: null },
          capabilityId: HIAP_MEED_RANKING_CONTEXT_CAPABILITY,
          input,
        }),
      ).resolves.toBeNull();
    });
  });

  it("returns nothing for an output plan without chapters", async () => {
    findReport.mockResolvedValue({ actionId: "t1", chapters: {} });

    await expect(buildMeedOutputPlanContext("p1")).resolves.toBeNull();
  });
});
