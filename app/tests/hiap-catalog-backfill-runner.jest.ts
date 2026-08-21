import type {
  HIAPCatalogBackfillPage,
  HIAPCatalogBackfillPageOptions,
} from "@/backend/hiap/HiapNativeInputCatalogService";

import {
  parseHIAPCatalogBackfillConfig,
  runHIAPCatalogBackfill,
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
    ).toEqual({ batchSize: 40, maxBatches: 3, dryRun: true });
  });

  it("processes ranking pages before action-plan pages and carries the cursor", async () => {
    const rankingPages: HIAPCatalogBackfillPageOptions[] = [];
    const actionPlanPages: HIAPCatalogBackfillPageOptions[] = [];
    const deps: HIAPCatalogBackfillRunnerDeps = {
      acquireLock: jest.fn().mockResolvedValue(true),
      releaseLock: jest.fn().mockResolvedValue(undefined),
      processRankingsPage: jest.fn(async (options) => {
        rankingPages.push(options);
        return rankingPages.length === 1
          ? page({
              hasMore: true,
              nextCursor: { created: "2026-01-01T00:00:00.000Z", id: "r-1" },
            })
          : page({ scanned: 2, repaired: 2 });
      }),
      processActionPlansPage: jest.fn(async (options) => {
        actionPlanPages.push(options);
        return page({ scanned: 3, repaired: 2, failed: 1 });
      }),
    };

    await expect(
      runHIAPCatalogBackfill({ batchSize: 10, dryRun: true }, deps),
    ).resolves.toEqual({
      skipped: false,
      pages: 3,
      rankings: { scanned: 3, repaired: 3, failed: 0 },
      actionPlans: { scanned: 3, repaired: 2, failed: 1 },
    });
    expect(rankingPages).toEqual([
      { limit: 10, dryRun: true },
      {
        limit: 10,
        dryRun: true,
        cursor: { created: "2026-01-01T00:00:00.000Z", id: "r-1" },
      },
    ]);
    expect(actionPlanPages).toEqual([{ limit: 10, dryRun: true }]);
  });

  it("does not process or release a lock it did not acquire", async () => {
    const deps: HIAPCatalogBackfillRunnerDeps = {
      acquireLock: jest.fn().mockResolvedValue(false),
      releaseLock: jest.fn().mockResolvedValue(undefined),
      processRankingsPage: jest.fn(),
      processActionPlansPage: jest.fn(),
    };

    await expect(
      runHIAPCatalogBackfill({ batchSize: 10, dryRun: false }, deps),
    ).resolves.toEqual({ skipped: true, pages: 0 });
    expect(deps.processRankingsPage).not.toHaveBeenCalled();
    expect(deps.processActionPlansPage).not.toHaveBeenCalled();
    expect(deps.releaseLock).not.toHaveBeenCalled();
  });
});
