import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";
import { Op } from "sequelize";

const catalogModel = {
  findAll: jest.fn(),
  findOne: jest.fn(),
};
const rankingModel = {
  findAll: jest.fn(),
  findByPk: jest.fn(),
};
const rankedModel = {
  findAll: jest.fn(),
};
const removedModel = {
  findAll: jest.fn(),
};
const inventoryModel = {
  findByPk: jest.fn(),
};
const registerNativeInput = jest.fn();
const supersedeNativeInput = jest.fn();
const withdrawNativeInput = jest.fn();

const mockDb = {
  models: {
    NativeInputCatalog: catalogModel,
    MeedRanking: rankingModel,
    MeedActionRanked: rankedModel,
    MeedActionRemoved: removedModel,
    Inventory: inventoryModel,
    City: {},
    Project: {},
    Organization: {},
  },
};

jest.unstable_mockModule("@/models", () => ({ db: mockDb }));
jest.mock("@/models", () => ({ db: mockDb }));
jest.unstable_mockModule("@/backend/NativeInputCatalogService", () => ({
  registerNativeInput,
  supersedeNativeInput,
  withdrawNativeInput,
}));
jest.mock("@/backend/NativeInputCatalogService", () => ({
  registerNativeInput,
  supersedeNativeInput,
  withdrawNativeInput,
}));
jest.unstable_mockModule("@/services/logger", () => ({
  logger: { error: jest.fn(), info: jest.fn() },
}));

let registerMEEDRanking: typeof import("@/backend/meed/MeedNativeInputCatalogService").registerMEEDRanking;
let backfillMissingMEEDRankingsPage: typeof import("@/backend/meed/MeedNativeInputCatalogService").backfillMissingMEEDRankingsPage;
let withdrawMEEDCatalogForInventory: typeof import("@/backend/meed/MeedNativeInputCatalogService").withdrawMEEDCatalogForInventory;

beforeAll(async () => {
  ({
    registerMEEDRanking,
    backfillMissingMEEDRankingsPage,
    withdrawMEEDCatalogForInventory,
  } = await import("@/backend/meed/MeedNativeInputCatalogService"));
});

beforeEach(() => {
  inventoryModel.findByPk.mockResolvedValue({
    inventoryId: "inventory-1",
    cityId: "city-1",
    city: {
      cityId: "city-1",
      projectId: "project-1",
      project: {
        projectId: "project-1",
        organizationId: "organization-1",
        organization: { organizationId: "organization-1" },
      },
    },
  });
  rankingModel.findByPk.mockResolvedValue(completedRanking);
  rankingModel.findAll.mockResolvedValue([]);
  rankedModel.findAll.mockResolvedValue([
    {
      id: "ranked-row-1",
      rankingId: "ranking-1",
      actionId: "action-1",
      rank: 1,
    },
  ]);
  removedModel.findAll.mockResolvedValue([]);
  catalogModel.findAll.mockResolvedValue([]);
  catalogModel.findOne.mockResolvedValue(null);
  registerNativeInput.mockResolvedValue({
    catalog: { id: "catalog-new" },
    created: true,
  });
  supersedeNativeInput.mockResolvedValue({});
  withdrawNativeInput.mockResolvedValue({});
});

afterEach(() => {
  jest.clearAllMocks();
});

const completedRanking = {
  id: "ranking-1",
  inventoryId: "inventory-1",
  userId: "user-1",
  inputDigest: "input-digest",
  contentDigest: "result-digest",
  status: "completed",
  requestedLanguages: ["en"],
  topN: 10,
  created: new Date("2026-08-24T12:00:00.000Z"),
};

describe("MeedNativeInputCatalogService", () => {
  it("registers a completed ranking as a pointer-only catalog entry", async () => {
    await registerMEEDRanking("ranking-1");

    expect(registerNativeInput).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "hiap_meed_ranking",
        owningModule: "hiap_meed",
        sourceType: "hiap_meed_ranking",
        sourceId: "ranking-1",
        inventoryId: "inventory-1",
        cityId: "city-1",
        projectId: "project-1",
        organizationId: "organization-1",
        contentDigest: "result-digest",
        labels: expect.objectContaining({
          rankingId: "ranking-1",
          actionCount: 1,
        }),
      }),
    );
    expect(registerNativeInput.mock.calls[0][0]).not.toHaveProperty("userId");

    const registrationInput = registerNativeInput.mock.calls[0][0];
    expect(registrationInput).not.toHaveProperty("rankedActions");
    expect(registrationInput).not.toHaveProperty("removedActions");
    expect(registrationInput).not.toHaveProperty("explanations");
    expect(registrationInput).not.toHaveProperty("evidence");
  });

  it("rejects non-completed and incomplete rankings", async () => {
    rankingModel.findByPk.mockResolvedValueOnce({
      ...completedRanking,
      status: "running",
    });
    await expect(registerMEEDRanking("ranking-1")).rejects.toThrow(
      "Only completed MEED rankings",
    );

    rankingModel.findByPk.mockResolvedValueOnce(completedRanking);
    rankedModel.findAll.mockResolvedValueOnce([]);
    removedModel.findAll.mockResolvedValueOnce([]);
    await expect(registerMEEDRanking("ranking-1")).rejects.toThrow(
      "Only persisted MEED rankings",
    );
    expect(registerNativeInput).not.toHaveBeenCalled();
  });

  it("reuses the same catalog entry when the same ranking is retried", async () => {
    catalogModel.findOne.mockResolvedValueOnce({ id: "catalog-existing" });
    await expect(registerMEEDRanking("ranking-1")).resolves.toEqual({
      catalog: { id: "catalog-existing" },
      created: false,
    });
    expect(registerNativeInput).not.toHaveBeenCalled();
  });

  it("supersedes the previous active inventory version even when content matches an older run", async () => {
    catalogModel.findOne.mockResolvedValueOnce(null);
    catalogModel.findAll.mockResolvedValueOnce([
      {
        id: "catalog-old",
        sourceId: "ranking-old",
        availability: "active",
      },
    ]);
    await registerMEEDRanking("ranking-1");
    expect(supersedeNativeInput).toHaveBeenCalledWith(
      "catalog-old",
      expect.objectContaining({ sourceType: "hiap_meed_ranking" }),
    );
    expect(catalogModel.findAll).toHaveBeenCalledWith({
      where: {
        owningModule: "hiap_meed",
        sourceType: "hiap_meed_ranking",
        inventoryId: "inventory-1",
        availability: "active",
      },
    });
  });

  it("keeps only the newest source active across an A to B to C history", async () => {
    rankingModel.findByPk
      .mockResolvedValueOnce({ ...completedRanking, id: "ranking-a" })
      .mockResolvedValueOnce({ ...completedRanking, id: "ranking-b" })
      .mockResolvedValueOnce({ ...completedRanking, id: "ranking-c" });
    catalogModel.findOne.mockResolvedValue(null);
    catalogModel.findAll
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: "catalog-a", availability: "active" }])
      .mockResolvedValueOnce([{ id: "catalog-b", availability: "active" }]);
    registerNativeInput
      .mockResolvedValueOnce({ catalog: { id: "catalog-a" }, created: true })
      .mockResolvedValueOnce({ catalog: { id: "catalog-b" }, created: true })
      .mockResolvedValueOnce({ catalog: { id: "catalog-c" }, created: true });

    await registerMEEDRanking("ranking-a");
    await registerMEEDRanking("ranking-b");
    await registerMEEDRanking("ranking-c");

    expect(
      registerNativeInput.mock.calls.map(([input]) => input.sourceId),
    ).toEqual(["ranking-a", "ranking-b", "ranking-c"]);
    expect(
      supersedeNativeInput.mock.calls.map(([catalogId]) => catalogId),
    ).toEqual(["catalog-a", "catalog-b"]);
  });

  it("does not reactivate a historical source when it is registered again", async () => {
    catalogModel.findOne.mockResolvedValueOnce({
      id: "catalog-historical",
      availability: "superseded",
    });

    await expect(registerMEEDRanking("ranking-1")).resolves.toEqual({
      catalog: { id: "catalog-historical", availability: "superseded" },
      created: false,
    });

    expect(registerNativeInput).not.toHaveBeenCalled();
    expect(supersedeNativeInput).not.toHaveBeenCalled();
    expect(catalogModel.findOne).toHaveBeenCalledWith({
      where: {
        owningModule: "hiap_meed",
        sourceType: "hiap_meed_ranking",
        sourceId: "ranking-1",
        availability: { [Op.ne]: "withdrawn" },
      },
    });
  });

  it("repairs older active versions when the current registration already exists", async () => {
    catalogModel.findOne.mockResolvedValueOnce({ id: "catalog-current" });
    catalogModel.findAll.mockResolvedValueOnce([
      {
        id: "catalog-old",
        sourceId: "ranking-old",
        availability: "active",
      },
    ]);

    await expect(registerMEEDRanking("ranking-1")).resolves.toEqual({
      catalog: { id: "catalog-current" },
      created: false,
    });

    expect(supersedeNativeInput).toHaveBeenCalledWith(
      "catalog-old",
      expect.objectContaining({ sourceType: "hiap_meed_ranking" }),
    );
  });

  it("backfills missing rankings and retries transient catalog failures", async () => {
    rankingModel.findAll.mockResolvedValue([completedRanking]);
    catalogModel.findOne.mockResolvedValue(null);
    registerNativeInput.mockRejectedValueOnce(new Error("temporary failure"));

    await expect(
      backfillMissingMEEDRankingsPage({ limit: 25, dryRun: false }),
    ).resolves.toMatchObject({ repaired: 0, failed: 1 });

    registerNativeInput.mockResolvedValue({
      catalog: { id: "catalog-recovered" },
      created: true,
    });
    await expect(
      backfillMissingMEEDRankingsPage({ limit: 25, dryRun: false }),
    ).resolves.toMatchObject({ repaired: 1, failed: 0 });
    expect(registerNativeInput).toHaveBeenCalledTimes(2);
  });

  it("uses a bounded, resumable page when backfilling rankings", async () => {
    const firstCreated = new Date("2026-08-24T12:00:00.000Z");
    const lastCreated = new Date("2026-08-24T13:00:00.000Z");
    rankingModel.findAll.mockResolvedValue([
      { ...completedRanking, id: "ranking-first", created: firstCreated },
      { ...completedRanking, id: "ranking-last", created: lastCreated },
    ]);

    await expect(
      backfillMissingMEEDRankingsPage({ limit: 2, dryRun: true }),
    ).resolves.toEqual({
      scanned: 2,
      repaired: 2,
      failed: 0,
      hasMore: true,
      nextCursor: {
        created: lastCreated.toISOString(),
        id: "ranking-last",
      },
    });

    expect(rankingModel.findAll).toHaveBeenCalledWith({
      where: { status: "completed" },
      order: [
        ["created", "ASC"],
        ["id", "ASC"],
      ],
      limit: 2,
    });
    expect(registerNativeInput).not.toHaveBeenCalled();
  });

  it("returns the last ranking cursor even when the page has no more rows", async () => {
    const lastCreated = new Date("2026-08-24T13:00:00.000Z");
    rankingModel.findAll.mockResolvedValue([
      { ...completedRanking, id: "ranking-last", created: lastCreated },
    ]);

    await expect(
      backfillMissingMEEDRankingsPage({ limit: 2, dryRun: true }),
    ).resolves.toEqual({
      scanned: 1,
      repaired: 1,
      failed: 0,
      hasMore: false,
      nextCursor: {
        created: lastCreated.toISOString(),
        id: "ranking-last",
      },
    });
  });

  it("withdraws active MEED catalog entries for an inventory without deleting history", async () => {
    catalogModel.findAll.mockResolvedValue([
      { id: "catalog-1" },
      { id: "catalog-2" },
    ]);

    await expect(withdrawMEEDCatalogForInventory("inventory-1")).resolves.toBe(
      2,
    );
    expect(withdrawNativeInput).toHaveBeenNthCalledWith(1, "catalog-1");
    expect(withdrawNativeInput).toHaveBeenNthCalledWith(2, "catalog-2");
  });
});
