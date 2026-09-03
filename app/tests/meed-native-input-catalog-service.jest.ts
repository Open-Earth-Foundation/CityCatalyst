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
const transaction = { id: "transaction-1" };
const sequelize = {
  transaction: jest.fn(async (callback) => callback(transaction)),
  query: jest.fn().mockResolvedValue([]),
};

const mockDb = {
  sequelize,
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
  jest.resetAllMocks();
  sequelize.transaction.mockImplementation(async (callback) =>
    callback(transaction),
  );
  sequelize.query.mockResolvedValue([]);
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
      transaction,
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
    const oldCatalog = {
      id: "catalog-old",
      sourceId: "ranking-old",
      availability: "active",
      update: jest.fn(),
    };
    catalogModel.findOne.mockResolvedValueOnce(null);
    catalogModel.findAll.mockResolvedValueOnce([oldCatalog]);
    rankingModel.findByPk
      .mockResolvedValueOnce(completedRanking)
      .mockResolvedValueOnce({
        ...completedRanking,
        id: "ranking-old",
        created: new Date("2026-08-24T11:00:00.000Z"),
      });
    await registerMEEDRanking("ranking-1");
    expect(supersedeNativeInput).not.toHaveBeenCalled();
    expect(oldCatalog.update).toHaveBeenCalledWith(
      { availability: "superseded", supersededById: "catalog-new" },
      { transaction },
    );
    expect(catalogModel.findAll).toHaveBeenCalledWith({
      where: {
        owningModule: "hiap_meed",
        sourceType: "hiap_meed_ranking",
        inventoryId: "inventory-1",
        availability: "active",
      },
      transaction,
    });
  });

  it("keeps a newer completed ranking active when an older registration is delayed", async () => {
    const olderRanking = {
      ...completedRanking,
      id: "ranking-a",
      created: new Date("2026-08-24T12:00:00.000Z"),
    };
    const newerRanking = {
      ...completedRanking,
      id: "ranking-b",
      created: new Date("2026-08-24T13:00:00.000Z"),
    };
    const olderCatalog = {
      id: "catalog-a",
      availability: "active",
      update: jest.fn(),
    };
    const newerCatalog = {
      id: "catalog-b",
      sourceId: "ranking-b",
      availability: "active",
      update: jest.fn(),
    };

    rankingModel.findByPk
      .mockResolvedValueOnce(olderRanking)
      .mockResolvedValueOnce(newerRanking);
    catalogModel.findOne.mockResolvedValueOnce(null);
    catalogModel.findAll.mockResolvedValueOnce([newerCatalog]);
    registerNativeInput.mockResolvedValueOnce({
      catalog: olderCatalog,
      created: true,
    });

    await expect(registerMEEDRanking("ranking-a")).resolves.toEqual({
      catalog: olderCatalog,
      created: true,
    });

    expect(sequelize.transaction).toHaveBeenCalledTimes(1);
    expect(sequelize.query).toHaveBeenCalledWith(
      "SELECT pg_advisory_xact_lock(hashtext($1))",
      expect.objectContaining({
        replacements: ["citycatalyst:hiap-meed-ranking:inventory-1"],
        transaction,
      }),
    );
    expect(olderCatalog.update).toHaveBeenCalledWith(
      { availability: "superseded", supersededById: "catalog-b" },
      { transaction },
    );
    expect(newerCatalog.update).not.toHaveBeenCalled();
    expect(supersedeNativeInput).not.toHaveBeenCalled();
  });

  it("serializes overlapping registrations for the same inventory", async () => {
    const rankings = {
      "ranking-a": {
        ...completedRanking,
        id: "ranking-a",
        created: new Date("2026-08-24T12:00:00.000Z"),
      },
      "ranking-b": {
        ...completedRanking,
        id: "ranking-b",
        created: new Date("2026-08-24T13:00:00.000Z"),
      },
    };
    const catalogA = {
      id: "catalog-a",
      sourceId: "ranking-a",
      availability: "active",
      update: jest.fn(async (values) => Object.assign(catalogA, values)),
    };
    const catalogB = {
      id: "catalog-b",
      sourceId: "ranking-b",
      availability: "active",
      update: jest.fn(async (values) => Object.assign(catalogB, values)),
    };
    const catalogs = [catalogA, catalogB];
    let lockHeld = false;
    const lockWaiters: Array<() => void> = [];
    let criticalSections = 0;
    let maxCriticalSections = 0;

    rankingModel.findByPk.mockImplementation(
      async (rankingId) => rankings[rankingId as keyof typeof rankings],
    );
    catalogModel.findOne.mockResolvedValue(null);
    catalogModel.findAll.mockImplementation(async () =>
      catalogs.filter((catalog) => catalog.availability === "active"),
    );
    registerNativeInput.mockImplementation(async (input) => {
      const catalog = input.sourceId === "ranking-a" ? catalogA : catalogB;
      await new Promise<void>((resolve) => setImmediate(resolve));
      return { catalog, created: true };
    });
    sequelize.query.mockImplementation(async () => {
      if (lockHeld) {
        await new Promise<void>((resolve) => lockWaiters.push(resolve));
      }
      lockHeld = true;
    });
    sequelize.transaction.mockImplementation(async (callback) => {
      try {
        return await callback(transaction);
      } finally {
        lockHeld = false;
        lockWaiters.shift()?.();
      }
    });
    catalogModel.findOne.mockImplementation(async () => {
      criticalSections++;
      maxCriticalSections = Math.max(maxCriticalSections, criticalSections);
      await new Promise<void>((resolve) => setImmediate(resolve));
      criticalSections--;
      return null;
    });

    await Promise.all([
      registerMEEDRanking("ranking-a"),
      registerMEEDRanking("ranking-b"),
    ]);

    expect(maxCriticalSections).toBe(1);
    expect(
      catalogs.filter((catalog) => catalog.availability === "active"),
    ).toEqual([catalogB]);
    expect(catalogA.update).toHaveBeenCalledWith(
      { availability: "superseded", supersededById: "catalog-b" },
      { transaction },
    );
  });

  it("keeps only the newest source active across an A to B to C history", async () => {
    rankingModel.findByPk.mockImplementation(async (rankingId) => ({
      ...completedRanking,
      id: rankingId,
      created: new Date(
        `2026-08-24T${rankingId === "ranking-a" ? "12" : rankingId === "ranking-b" ? "13" : "14"}:00:00.000Z`,
      ),
    }));
    catalogModel.findOne.mockResolvedValue(null);
    const catalogA = {
      id: "catalog-a",
      sourceId: "ranking-a",
      availability: "active",
      update: jest.fn(),
    };
    const catalogB = {
      id: "catalog-b",
      sourceId: "ranking-b",
      availability: "active",
      update: jest.fn(),
    };
    catalogModel.findAll
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([catalogA])
      .mockResolvedValueOnce([catalogB]);
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
    expect(catalogA.update).toHaveBeenCalledWith(
      { availability: "superseded", supersededById: "catalog-b" },
      { transaction },
    );
    expect(catalogB.update).toHaveBeenCalledWith(
      { availability: "superseded", supersededById: "catalog-c" },
      { transaction },
    );
    expect(supersedeNativeInput).not.toHaveBeenCalled();
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
      transaction,
    });
  });

  it("repairs older active versions when the current registration already exists", async () => {
    const oldCatalog = {
      id: "catalog-old",
      sourceId: "ranking-old",
      availability: "active",
      update: jest.fn(),
    };
    catalogModel.findOne.mockResolvedValueOnce({ id: "catalog-current" });
    catalogModel.findAll.mockResolvedValueOnce([oldCatalog]);
    rankingModel.findByPk
      .mockResolvedValueOnce(completedRanking)
      .mockResolvedValueOnce({
        ...completedRanking,
        id: "ranking-old",
        created: new Date("2026-08-24T11:00:00.000Z"),
      });

    await expect(registerMEEDRanking("ranking-1")).resolves.toEqual({
      catalog: { id: "catalog-current" },
      created: false,
    });

    expect(oldCatalog.update).toHaveBeenCalledWith(
      { availability: "superseded", supersededById: "catalog-current" },
      { transaction },
    );
    expect(supersedeNativeInput).not.toHaveBeenCalled();
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
