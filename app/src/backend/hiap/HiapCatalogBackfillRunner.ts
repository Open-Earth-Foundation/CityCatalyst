import { QueryTypes } from "sequelize";

import { db } from "@/models";
import {
  backfillMissingHIAPActionPlansPage,
  backfillMissingHIAPRankingsPage,
  type HIAPCatalogBackfillPage,
  type HIAPCatalogBackfillPageOptions,
} from "@/backend/hiap/HiapNativeInputCatalogService";
import { logger } from "@/services/logger";

const LOCK_KEY = "citycatalyst:hiap-catalog-backfill";
const DEFAULT_BATCH_SIZE = 25;
const MAX_BATCH_SIZE = 1000;

export type HIAPCatalogBackfillConfig = {
  batchSize: number;
  maxBatches?: number;
  dryRun: boolean;
};

type BackfillTotals = {
  scanned: number;
  repaired: number;
  failed: number;
};

export type HIAPCatalogBackfillResult = {
  skipped: boolean;
  pages: number;
  rankings?: BackfillTotals;
  actionPlans?: BackfillTotals;
};

export type HIAPCatalogBackfillRunnerDeps = {
  acquireLock: () => Promise<boolean>;
  releaseLock: () => Promise<void>;
  processRankingsPage: (
    options: HIAPCatalogBackfillPageOptions,
  ) => Promise<HIAPCatalogBackfillPage>;
  processActionPlansPage: (
    options: HIAPCatalogBackfillPageOptions,
  ) => Promise<HIAPCatalogBackfillPage>;
};

function parsePositiveInteger(
  env: NodeJS.ProcessEnv,
  name: string,
  fallback: number,
  maximum?: number,
): number {
  const raw = env[name];
  if (raw === undefined || raw.trim() === "") return fallback;

  const value = Number(raw);
  if (
    !Number.isInteger(value) ||
    value < 1 ||
    (maximum !== undefined && value > maximum)
  ) {
    throw new Error(`${name} must be a positive integer`);
  }
  return value;
}

export function parseHIAPCatalogBackfillConfig(
  env: NodeJS.ProcessEnv = process.env,
): HIAPCatalogBackfillConfig {
  const maxBatchesRaw = env.HIAP_CATALOG_BACKFILL_MAX_BATCHES;
  const maxBatches =
    maxBatchesRaw === undefined || maxBatchesRaw.trim() === ""
      ? undefined
      : parsePositiveInteger(env, "HIAP_CATALOG_BACKFILL_MAX_BATCHES", 1);

  return {
    batchSize: parsePositiveInteger(
      env,
      "HIAP_CATALOG_BACKFILL_BATCH_SIZE",
      DEFAULT_BATCH_SIZE,
      MAX_BATCH_SIZE,
    ),
    maxBatches,
    dryRun: env.HIAP_CATALOG_BACKFILL_DRY_RUN?.toLowerCase() === "true",
  };
}

async function acquireHIAPCatalogBackfillLock(): Promise<boolean> {
  if (!db.sequelize) throw new Error("Database not initialized");

  const rows = await db.sequelize.query<{ locked: boolean }>(
    "SELECT pg_try_advisory_lock(hashtext(:lockKey)) AS locked",
    {
      replacements: { lockKey: LOCK_KEY },
      type: QueryTypes.SELECT,
    },
  );
  return rows[0]?.locked === true;
}

async function releaseHIAPCatalogBackfillLock(): Promise<void> {
  if (!db.sequelize) return;

  await db.sequelize.query("SELECT pg_advisory_unlock(hashtext(:lockKey))", {
    replacements: { lockKey: LOCK_KEY },
    type: QueryTypes.SELECT,
  });
}

const defaultDeps: HIAPCatalogBackfillRunnerDeps = {
  acquireLock: acquireHIAPCatalogBackfillLock,
  releaseLock: releaseHIAPCatalogBackfillLock,
  processRankingsPage: backfillMissingHIAPRankingsPage,
  processActionPlansPage: backfillMissingHIAPActionPlansPage,
};

function emptyTotals(): BackfillTotals {
  return { scanned: 0, repaired: 0, failed: 0 };
}

function addPage(totals: BackfillTotals, page: HIAPCatalogBackfillPage): void {
  totals.scanned += page.scanned;
  totals.repaired += page.repaired;
  totals.failed += page.failed;
}

async function processPages(
  processPage: HIAPCatalogBackfillRunnerDeps["processRankingsPage"],
  config: HIAPCatalogBackfillConfig,
  state: { pages: number },
): Promise<BackfillTotals> {
  const totals = emptyTotals();
  let cursor: HIAPCatalogBackfillPageOptions["cursor"];

  while (config.maxBatches === undefined || state.pages < config.maxBatches) {
    const page = await processPage({
      limit: config.batchSize,
      cursor,
      dryRun: config.dryRun,
    });
    state.pages++;
    addPage(totals, page);

    if (!page.hasMore) break;
    if (!page.nextCursor) {
      throw new Error("HIAP catalog backfill page hasMore without nextCursor");
    }
    cursor = page.nextCursor;
  }

  return totals;
}

export async function runHIAPCatalogBackfill(
  config: HIAPCatalogBackfillConfig,
  deps: HIAPCatalogBackfillRunnerDeps = defaultDeps,
): Promise<HIAPCatalogBackfillResult> {
  if (!(await deps.acquireLock())) {
    logger.info("HIAP catalog backfill skipped because another run is active");
    return { skipped: true, pages: 0 };
  }

  const state = { pages: 0 };
  try {
    const rankings = await processPages(
      deps.processRankingsPage,
      config,
      state,
    );
    const actionPlans =
      config.maxBatches !== undefined && state.pages >= config.maxBatches
        ? emptyTotals()
        : await processPages(deps.processActionPlansPage, config, state);

    const result = {
      skipped: false,
      pages: state.pages,
      rankings,
      actionPlans,
    } satisfies HIAPCatalogBackfillResult;
    logger.info(result, "HIAP catalog backfill completed");
    return result;
  } finally {
    await deps.releaseLock();
  }
}
