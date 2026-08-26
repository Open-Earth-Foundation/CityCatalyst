import type { Sequelize } from "sequelize";
import { describe, expect, it, jest } from "@jest/globals";

import type {
  HIAPCatalogBackfillPage,
  HIAPCatalogBackfillPageOptions,
} from "@/backend/hiap/HiapNativeInputCatalogService";

import {
  acquireHIAPCatalogBackfillLock,
  parseHIAPCatalogBackfillConfig,
  releaseHIAPCatalogBackfillLock,
  runHIAPCatalogBackfill,
  type HIAPCatalogBackfillCheckpoint,
  type HIAPCatalogBackfillRunnerDeps,
} from "@/backend/hiap/HiapCatalogBackfillRunner";

const page = (
  overrides: Partial<HIAPCatalogBackfillPage> = {},
): HIAPCatalogBackfillPage => ({
  scanned: 1,
  repaired: 1,
  failed: 0,
  hasMore: false,
  nextCursor: null,
  ...overrides,
});

describe("HIAP catalog backfill runner", () => {
  it("parses bounded batch settings and dry-run mode", () => {
    expect(
      parseHIAPCatalogBackfillConfig({
        HIAP_CATALOG_BACKFILL_BATCH_SIZE: "40",
        HIAP_CATALOG_BACKFILL_MAX_BATCHES: "3",
        HIAP_CATALOG_BACKFILL_DRY_RUN: "true",
      }),
    ).toEqual({ batchSize: 40, maxBatchesPerType: 3, dryRun: true });
  });

  it("resumes each catalog type from its checkpoint and persists completion", async () => {
    const rankingPages: HIAPCatalogBackfillPageOptions[] = [];
    const actionPlanPages: HIAPCatalogBackfillPageOptions[] = [];
    const savedCheckpoints: HIAPCatalogBackfillCheckpoint[] = [];
    const initialCheckpoint: HIAPCatalogBackfillCheckpoint = {
      rankings: {
        cursor: { created: "2026-01-01T00:00:00.000Z", id: "r-0" },
        completed: false,
      },
      actionPlans: { cursor: null, completed: false },
      meedRankings: { cursor: null, completed: false },
    };
    const deps: HIAPCatalogBackfillRunnerDeps = {
      acquireLock: jest.fn().mockResolvedValue({ connectionId: "lock-1" }),
      releaseLock: jest.fn().mockResolvedValue(undefined),
      loadCheckpoint: jest.fn().mockResolvedValue(initialCheckpoint),
      saveCheckpoint: jest.fn(async (checkpoint) => {
        savedCheckpoints.push(checkpoint);
      }),
      processRankingsPage: jest.fn(async (options) => {
        rankingPages.push(options);
        return page({ scanned: 2, repaired: 2 });
      }),
      processActionPlansPage: jest.fn(async (options) => {
        actionPlanPages.push(options);
        return page({ scanned: 3, repaired: 3 });
      }),
      processMeedRankingsPage: jest
        .fn()
        .mockResolvedValue(page({ scanned: 4, repaired: 4 })),
    };

    await expect(
      runHIAPCatalogBackfill(
        { batchSize: 10, maxBatchesPerType: 1, dryRun: false },
        deps,
      ),
    ).resolves.toEqual({
      skipped: false,
      pages: 3,
      rankings: { scanned: 2, repaired: 2, failed: 0 },
      actionPlans: { scanned: 3, repaired: 3, failed: 0 },
      meedRankings: { scanned: 4, repaired: 4, failed: 0 },
    });
    expect(rankingPages).toEqual([
      {
        limit: 10,
        dryRun: false,
        cursor: { created: "2026-01-01T00:00:00.000Z", id: "r-0" },
      },
    ]);
    expect(actionPlanPages).toEqual([
      { limit: 10, dryRun: false, cursor: undefined },
    ]);
    expect(savedCheckpoints.at(-1)).toEqual({
      rankings: { cursor: null, completed: true },
      actionPlans: { cursor: null, completed: true },
      meedRankings: { cursor: null, completed: true },
    });
  });

  it("does not persist checkpoints during a dry run", async () => {
    const deps: HIAPCatalogBackfillRunnerDeps = {
      acquireLock: jest.fn().mockResolvedValue({ connectionId: "lock-1" }),
      releaseLock: jest.fn().mockResolvedValue(undefined),
      loadCheckpoint: jest.fn(),
      saveCheckpoint: jest.fn(),
      processRankingsPage: jest.fn().mockResolvedValue(page()),
      processActionPlansPage: jest.fn().mockResolvedValue(page()),
      processMeedRankingsPage: jest.fn().mockResolvedValue(page()),
    };

    await expect(
      runHIAPCatalogBackfill(
        { batchSize: 10, maxBatchesPerType: 1, dryRun: true },
        deps,
      ),
    ).resolves.toMatchObject({ skipped: false, pages: 3 });

    expect(deps.loadCheckpoint).not.toHaveBeenCalled();
    expect(deps.saveCheckpoint).not.toHaveBeenCalled();
  });

  it("keeps a failed page resumable instead of advancing past it", async () => {
    const savedCheckpoints: HIAPCatalogBackfillCheckpoint[] = [];
    const deps: HIAPCatalogBackfillRunnerDeps = {
      acquireLock: jest.fn().mockResolvedValue({ connectionId: "lock-1" }),
      releaseLock: jest.fn().mockResolvedValue(undefined),
      loadCheckpoint: jest.fn().mockResolvedValue({
        rankings: { cursor: null, completed: false },
        actionPlans: { cursor: null, completed: true },
        meedRankings: { cursor: null, completed: true },
      }),
      saveCheckpoint: jest.fn(async (checkpoint) => {
        savedCheckpoints.push(checkpoint);
      }),
      processRankingsPage: jest.fn().mockResolvedValue(
        page({
          failed: 1,
          hasMore: true,
          nextCursor: { created: "2026-01-01T00:00:00.000Z", id: "r-1" },
        }),
      ),
      processActionPlansPage: jest.fn(),
      processMeedRankingsPage: jest.fn(),
    };

    await expect(
      runHIAPCatalogBackfill(
        { batchSize: 10, maxBatchesPerType: 1, dryRun: false },
        deps,
      ),
    ).resolves.toMatchObject({
      skipped: false,
      rankings: { failed: 1 },
      actionPlans: { scanned: 0, repaired: 0, failed: 0 },
      meedRankings: { scanned: 0, repaired: 0, failed: 0 },
    });
    expect(savedCheckpoints.at(-1)).toEqual({
      rankings: { cursor: null, completed: false },
      actionPlans: { cursor: null, completed: true },
      meedRankings: { cursor: null, completed: true },
    });
  });

  it("uses one dedicated connection for lock acquisition and release", async () => {
    const firstConnection = {
      query: jest
        .fn()
        .mockResolvedValueOnce({ rows: [{ locked: true }] })
        .mockResolvedValueOnce({ rows: [{ unlocked: true }] }),
    };
    const secondConnection = {
      query: jest.fn().mockResolvedValue({ rows: [{ locked: false }] }),
    };
    const connectionManager = {
      getConnection: jest
        .fn()
        .mockResolvedValueOnce(firstConnection)
        .mockResolvedValueOnce(secondConnection),
      releaseConnection: jest.fn(),
    };
    const sequelize = { connectionManager } as unknown as Sequelize;

    const firstLease = await acquireHIAPCatalogBackfillLock(sequelize);
    const secondLease = await acquireHIAPCatalogBackfillLock(sequelize);

    expect(firstLease?.connection).toBe(firstConnection);
    expect(secondLease).toBeNull();
    expect(connectionManager.releaseConnection).toHaveBeenCalledWith(
      secondConnection,
    );

    await releaseHIAPCatalogBackfillLock(firstLease!);

    expect(firstConnection.query).toHaveBeenLastCalledWith(
      "SELECT pg_advisory_unlock(hashtext($1))",
      ["citycatalyst:hiap-catalog-backfill"],
    );
    expect(connectionManager.releaseConnection).toHaveBeenLastCalledWith(
      firstConnection,
    );
  });

  it("does not process or release a lock it did not acquire", async () => {
    const deps: HIAPCatalogBackfillRunnerDeps = {
      acquireLock: jest.fn().mockResolvedValue(null),
      releaseLock: jest.fn().mockResolvedValue(undefined),
      loadCheckpoint: jest.fn(),
      saveCheckpoint: jest.fn(),
      processRankingsPage: jest.fn(),
      processActionPlansPage: jest.fn(),
      processMeedRankingsPage: jest.fn(),
    };

    await expect(
      runHIAPCatalogBackfill(
        { batchSize: 10, maxBatchesPerType: 1, dryRun: false },
        deps,
      ),
    ).resolves.toEqual({ skipped: true, pages: 0 });
    expect(deps.loadCheckpoint).not.toHaveBeenCalled();
    expect(deps.processRankingsPage).not.toHaveBeenCalled();
    expect(deps.processActionPlansPage).not.toHaveBeenCalled();
    expect(deps.releaseLock).not.toHaveBeenCalled();
  });

  it("processes MEED rankings through the bounded checkpoint runner", async () => {
    const processMeedRankingsPage = jest
      .fn()
      .mockResolvedValue(page({ scanned: 4, repaired: 3 }));
    const deps = {
      acquireLock: jest.fn().mockResolvedValue({ connectionId: "lock-1" }),
      releaseLock: jest.fn().mockResolvedValue(undefined),
      loadCheckpoint: jest.fn().mockResolvedValue({
        rankings: { cursor: null, completed: true },
        actionPlans: { cursor: null, completed: true },
        meedRankings: { cursor: null, completed: false },
      }),
      saveCheckpoint: jest.fn(),
      processRankingsPage: jest.fn(),
      processActionPlansPage: jest.fn(),
      processMeedRankingsPage,
    } as unknown as HIAPCatalogBackfillRunnerDeps & {
      processMeedRankingsPage: jest.Mock;
    };

    await expect(
      runHIAPCatalogBackfill(
        { batchSize: 10, maxBatchesPerType: 1, dryRun: false },
        deps,
      ),
    ).resolves.toMatchObject({
      skipped: false,
      pages: 1,
      meedRankings: { scanned: 4, repaired: 3, failed: 0 },
    });
    expect(processMeedRankingsPage).toHaveBeenCalledWith({
      limit: 10,
      dryRun: false,
      cursor: undefined,
    });
  });
});
