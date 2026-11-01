import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";
import { randomUUID } from "node:crypto";

import GlobalAPIService from "@/backend/GlobalAPIService";
import { buildHiapInventoryContext } from "@/backend/agentic/hiap/context";
import {
  HIAP_DEFAULT_PAGE_SIZE,
  hiapInventoryContextInputSchema,
} from "@/backend/agentic/hiap/registry";
import { db } from "@/models";
import {
  ACTION_TYPES,
  HighImpactActionRankingStatus,
  LANGUAGES,
} from "@/util/types";
import { setupTests } from "./helpers";

const inventoryId = "20000000-0000-4000-8000-000000000001";
const mitigationRankingId = "30000000-0000-4000-8000-000000000001";
const adaptationRankingId = "30000000-0000-4000-8000-000000000002";

function ranked(
  actionId: string,
  type: ACTION_TYPES,
  rank: number,
  selected: boolean,
) {
  const attributes = {
    id: randomUUID(),
    hiaRankingId:
      type === ACTION_TYPES.Mitigation
        ? mitigationRankingId
        : adaptationRankingId,
    actionId,
    rank,
    explanation: { explanations: { en: `${actionId} explanation` } },
    lang: "en",
    type,
    name: actionId,
    isSelected: selected,
  };
  return { ...attributes, toJSON: () => attributes };
}

/** Mitigation: 30 ranked actions, `selectedRanks` selected. Adaptation: 3 ranked. */
function mockReads(selectedRanks: number[], unrankedSelected: string[] = []) {
  jest
    .spyOn(db.models.HighImpactActionRanking, "findOne")
    .mockImplementation(async (options: never) => {
      const type = (options as { where: { type: ACTION_TYPES } }).where.type;
      return {
        id:
          type === ACTION_TYPES.Mitigation
            ? mitigationRankingId
            : adaptationRankingId,
        status: HighImpactActionRankingStatus.SUCCESS,
        lastUpdated: new Date("2026-07-29T10:00:00Z"),
      } as never;
    });
  jest
    .spyOn(db.models.HighImpactActionRanked, "findAll")
    .mockImplementation(async (options: never) => {
      const id = (options as { where: { hiaRankingId: string } }).where
        .hiaRankingId;
      if (id === mitigationRankingId) {
        return Array.from({ length: 30 }, (_, index) =>
          ranked(
            `m-${index + 1}`,
            ACTION_TYPES.Mitigation,
            index + 1,
            selectedRanks.includes(index + 1),
          ),
        ) as never;
      }
      return [1, 2, 3].map((rank) =>
        ranked(`a-${rank}`, ACTION_TYPES.Adaptation, rank, false),
      ) as never;
    });
  jest
    .spyOn(db.models.UnrankedActionSelection, "findAll")
    .mockImplementation(async (options: never) => {
      const type = (options as { where: { actionType: ACTION_TYPES } }).where
        .actionType;
      return (
        type === ACTION_TYPES.Mitigation
          ? unrankedSelected.map((actionId) => ({
              actionId,
              lang: "en",
              isSelected: true,
            }))
          : []
      ) as never;
    });
  jest
    .spyOn(GlobalAPIService, "fetchAllClimateActions")
    .mockResolvedValue([] as never);
}

const ids = (category: { actions: { action_id: string }[] }) =>
  category.actions.map((action) => action.action_id);

describe("HIAP inventory context scope and paging", () => {
  beforeEach(() => {
    setupTests();
  });
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("keeps the original output when no option is passed", async () => {
    mockReads([2, 5]);
    const data = await buildHiapInventoryContext(inventoryId, LANGUAGES.en);

    expect(ids(data.mitigation!)).toEqual(["m-2", "m-5"]);
    // The default view has no paging fields (the CNB models forbid them).
    expect(data.mitigation).toMatchObject({
      selection_mode: "city_selected",
      counts: { ranked: 30, selected: 2, returned: 2 },
    });
    expect(data.mitigation!.counts).not.toHaveProperty("total");
    expect(data.mitigation).not.toHaveProperty("truncated");
    expect(data.adaptation).toMatchObject({
      selection_mode: "ranked_fallback",
      counts: { returned: 3 },
    });
  });

  it("returns every selection when more than three are selected", async () => {
    mockReads([1, 3, 4, 9, 20], ["city-added"]);
    const data = await buildHiapInventoryContext(inventoryId, LANGUAGES.en, {
      scope: "selected",
    });

    expect(ids(data.mitigation!)).toEqual([
      "m-1",
      "m-3",
      "m-4",
      "m-9",
      "m-20",
      "city-added",
    ]);
    expect(data.mitigation!.counts.selected).toBe(6);
    expect(data.mitigation!.truncated).toBe(false);
  });

  it("does not fall back to the ranking for scope selected without selections", async () => {
    mockReads([]);
    const data = await buildHiapInventoryContext(inventoryId, LANGUAGES.en, {
      scope: "selected",
    });

    expect(data.mitigation).toMatchObject({
      selection_mode: "none",
      actions: [],
    });
  });

  it("lists the full ranking, flags selections and pages through it", async () => {
    mockReads([2, 28]);
    const first = await buildHiapInventoryContext(inventoryId, LANGUAGES.en, {
      scope: "ranked",
      type: ACTION_TYPES.Mitigation,
    });

    expect(first.adaptation).toBeUndefined();
    expect(first.mitigation).toMatchObject({
      selection_mode: "ranked_all",
      truncated: true,
      counts: {
        ranked: 30,
        total: 30,
        returned: HIAP_DEFAULT_PAGE_SIZE,
        offset: 0,
      },
    });
    expect(first.mitigation!.actions[1]).toMatchObject({
      action_id: "m-2",
      selected: true,
    });
    expect(first.mitigation!.actions[0].selected).toBe(false);

    const second = await buildHiapInventoryContext(inventoryId, LANGUAGES.en, {
      scope: "ranked",
      type: ACTION_TYPES.Mitigation,
      offset: HIAP_DEFAULT_PAGE_SIZE,
    });
    expect(ids(second.mitigation!)).toEqual([
      "m-26",
      "m-27",
      "m-28",
      "m-29",
      "m-30",
    ]);
    expect(second.mitigation).toMatchObject({
      truncated: false,
      counts: { returned: 5, offset: 25, total: 30 },
    });
  });

  it("honors an explicit limit and keeps rank order for top-N", async () => {
    mockReads([]);
    const data = await buildHiapInventoryContext(inventoryId, LANGUAGES.en, {
      scope: "ranked",
      limit: 5,
    });

    expect(ids(data.mitigation!)).toEqual(["m-1", "m-2", "m-3", "m-4", "m-5"]);
    expect(data.mitigation!.truncated).toBe(true);
    expect(ids(data.adaptation!)).toEqual(["a-1", "a-2", "a-3"]);
    expect(data.adaptation!.truncated).toBe(false);
  });

  it("validates optional arguments in the capability schema", () => {
    const base = { city_id: randomUUID(), inventory_id: inventoryId };
    expect(hiapInventoryContextInputSchema.parse(base)).toEqual({
      ...base,
      language: "en",
    });
    expect(
      hiapInventoryContextInputSchema.safeParse({ ...base, limit: 51 }).success,
    ).toBe(false);
    expect(
      hiapInventoryContextInputSchema.safeParse({ ...base, offset: -1 })
        .success,
    ).toBe(false);
    expect(
      hiapInventoryContextInputSchema.safeParse({ ...base, scope: "all" })
        .success,
    ).toBe(false);
  });
});
