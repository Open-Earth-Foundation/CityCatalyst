import { QueryTypes, type Sequelize } from "sequelize";

import { db } from "@/models";
import {
  backfillMissingHIAPActionPlansPage,
  backfillMissingHIAPRankingsPage,
  type HIAPCatalogBackfillCursor,
  type HIAPCatalogBackfillPage,
  type HIAPCatalogBackfillPageOptions,
} from "@/backend/hiap/HiapNativeInputCatalogService";
import {
  backfillMissingMEEDRankingsPage,
  type MEEDCatalogBackfillCursor,
  type MEEDCatalogBackfillPage,
  type MEEDCatalogBackfillPageOptions,
} from "@/backend/meed/MeedNativeInputCatalogService";
import { logger } from "@/services/logger";

const LOCK_KEY = "citycatalyst:hiap-catalog-backfill";
const CHECKPOINT_KEY = LOCK_KEY;
const DEFAULT_BATCH_SIZE = 25;
const MAX_BATCH_SIZE = 1000;

export type HIAPCatalogBackfillConfig = {
  batchSize: number;
  maxBatchesPerType?: number;
  dryRun: boolean;
};

export type HIAPCatalogBackfillProgress = {
  cursor: HIAPCatalogBackfillCursor | null;
  completed: boolean;
};

export type HIAPCatalogBackfillCheckpoint = {
  rankings: HIAPCatalogBackfillProgress;
  actionPlans: HIAPCatalogBackfillProgress;
  meedRankings: {
    cursor: MEEDCatalogBackfillCursor | null;
    completed: boolean;
  };
};

export type HIAPCatalogBackfillPooledConnection = Awaited<
  ReturnType<Sequelize["connectionManager"]["getConnection"]>
> & {
  query: (
    sql: string,
    values?: readonly unknown[],
  ) => Promise<{ rows: Array<Record<string, unknown>> }>;
};

export type HIAPCatalogBackfillLock = {
  sequelize: Sequelize;
  connection: HIAPCatalogBackfillPooledConnection;
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
  meedRankings?: BackfillTotals;
};

export type HIAPCatalogBackfillRunnerDeps = {
  acquireLock: () => Promise<HIAPCatalogBackfillLock | null>;
  releaseLock: (lock: HIAPCatalogBackfillLock) => Promise<void>;
  loadCheckpoint: () => Promise<HIAPCatalogBackfillCheckpoint>;
  saveCheckpoint: (checkpoint: HIAPCatalogBackfillCheckpoint) => Promise<void>;
  processRankingsPage: (
    options: HIAPCatalogBackfillPageOptions,
  ) => Promise<HIAPCatalogBackfillPage>;
  processActionPlansPage: (
    options: HIAPCatalogBackfillPageOptions,
  ) => Promise<HIAPCatalogBackfillPage>;
  processMeedRankingsPage: (
    options: MEEDCatalogBackfillPageOptions,
  ) => Promise<MEEDCatalogBackfillPage>;
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
  const maxBatchesPerType =
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
    maxBatchesPerType,
    dryRun: env.HIAP_CATALOG_BACKFILL_DRY_RUN?.toLowerCase() === "true",
  };
}

export async function acquireHIAPCatalogBackfillLock(
  sequelize: Sequelize | null | undefined = db.sequelize,
): Promise<HIAPCatalogBackfillLock | null> {
  if (!sequelize) throw new Error("Database not initialized");

  const connection = (await sequelize.connectionManager.getConnection({
    type: "write",
  })) as HIAPCatalogBackfillPooledConnection;

  try {
    const result = await connection.query(
      "SELECT pg_try_advisory_lock(hashtext($1)) AS locked",
      [LOCK_KEY],
    );
    if (result.rows[0]?.locked !== true) {
      sequelize.connectionManager.releaseConnection(connection);
      return null;
    }

    return { sequelize, connection };
  } catch (error) {
    sequelize.connectionManager.releaseConnection(connection);
    throw error;
  }
}

export async function releaseHIAPCatalogBackfillLock(
  lock: HIAPCatalogBackfillLock,
): Promise<void> {
  try {
    await lock.connection.query("SELECT pg_advisory_unlock(hashtext($1))", [
      LOCK_KEY,
    ]);
  } finally {
    lock.sequelize.connectionManager.releaseConnection(lock.connection);
  }
}

function emptyCheckpoint(): HIAPCatalogBackfillCheckpoint {
  return {
    rankings: { cursor: null, completed: false },
    actionPlans: { cursor: null, completed: false },
    meedRankings: { cursor: null, completed: false },
  };
}

type HIAPCatalogBackfillCheckpointRow = {
  rankings_cursor_created: Date | string | null;
  rankings_cursor_id: string | null;
  rankings_completed: boolean;
  action_plans_cursor_created: Date | string | null;
  action_plans_cursor_id: string | null;
  action_plans_completed: boolean;
  meed_rankings_cursor_created: Date | string | null;
  meed_rankings_cursor_id: string | null;
  meed_rankings_completed: boolean;
};

function rowCursor(
  created: Date | string | null,
  id: string | null,
): HIAPCatalogBackfillCursor | null {
  if (created === null || id === null) return null;

  const date = created instanceof Date ? created : new Date(created);
  if (Number.isNaN(date.getTime())) {
    throw new Error("HIAP catalog backfill checkpoint has an invalid cursor");
  }

  return { created: date.toISOString(), id };
}

async function loadHIAPCatalogBackfillCheckpoint(): Promise<HIAPCatalogBackfillCheckpoint> {
  if (!db.sequelize) throw new Error("Database not initialized");

  const rows = await db.sequelize.query<HIAPCatalogBackfillCheckpointRow>(
    `
      SELECT
        rankings_cursor_created,
        rankings_cursor_id,
        rankings_completed,
        action_plans_cursor_created,
        action_plans_cursor_id,
        action_plans_completed,
        meed_rankings_cursor_created,
        meed_rankings_cursor_id,
        meed_rankings_completed
      FROM "HiapCatalogBackfillCheckpoint"
      WHERE job_key = :jobKey
    `,
    {
      replacements: { jobKey: CHECKPOINT_KEY },
      type: QueryTypes.SELECT,
    },
  );
  const row = rows[0];
  if (!row) return emptyCheckpoint();

  return {
    rankings: {
      cursor: rowCursor(row.rankings_cursor_created, row.rankings_cursor_id),
      completed: row.rankings_completed,
    },
    actionPlans: {
      cursor: rowCursor(
        row.action_plans_cursor_created,
        row.action_plans_cursor_id,
      ),
      completed: row.action_plans_completed,
    },
    meedRankings: {
      cursor: rowCursor(
        row.meed_rankings_cursor_created,
        row.meed_rankings_cursor_id,
      ),
      completed: row.meed_rankings_completed,
    },
  };
}

async function saveHIAPCatalogBackfillCheckpoint(
  checkpoint: HIAPCatalogBackfillCheckpoint,
): Promise<void> {
  if (!db.sequelize) throw new Error("Database not initialized");

  await db.sequelize.query(
    `
      INSERT INTO "HiapCatalogBackfillCheckpoint" (
        job_key,
        rankings_cursor_created,
        rankings_cursor_id,
        rankings_completed,
        action_plans_cursor_created,
        action_plans_cursor_id,
        action_plans_completed,
        meed_rankings_cursor_created,
        meed_rankings_cursor_id,
        meed_rankings_completed
      ) VALUES (
        :jobKey,
        :rankingsCursorCreated,
        :rankingsCursorId,
        :rankingsCompleted,
        :actionPlansCursorCreated,
        :actionPlansCursorId,
        :actionPlansCompleted,
        :meedRankingsCursorCreated,
        :meedRankingsCursorId,
        :meedRankingsCompleted
      )
      ON CONFLICT (job_key) DO UPDATE SET
        rankings_cursor_created = EXCLUDED.rankings_cursor_created,
        rankings_cursor_id = EXCLUDED.rankings_cursor_id,
        rankings_completed = EXCLUDED.rankings_completed,
        action_plans_cursor_created = EXCLUDED.action_plans_cursor_created,
        action_plans_cursor_id = EXCLUDED.action_plans_cursor_id,
        action_plans_completed = EXCLUDED.action_plans_completed,
        meed_rankings_cursor_created = EXCLUDED.meed_rankings_cursor_created,
        meed_rankings_cursor_id = EXCLUDED.meed_rankings_cursor_id,
        meed_rankings_completed = EXCLUDED.meed_rankings_completed,
        last_updated = NOW()
    `,
    {
      replacements: {
        jobKey: CHECKPOINT_KEY,
        rankingsCursorCreated: checkpoint.rankings.cursor?.created ?? null,
        rankingsCursorId: checkpoint.rankings.cursor?.id ?? null,
        rankingsCompleted: checkpoint.rankings.completed,
        actionPlansCursorCreated:
          checkpoint.actionPlans.cursor?.created ?? null,
        actionPlansCursorId: checkpoint.actionPlans.cursor?.id ?? null,
        actionPlansCompleted: checkpoint.actionPlans.completed,
        meedRankingsCursorCreated:
          checkpoint.meedRankings.cursor?.created ?? null,
        meedRankingsCursorId: checkpoint.meedRankings.cursor?.id ?? null,
        meedRankingsCompleted: checkpoint.meedRankings.completed,
      },
      type: QueryTypes.INSERT,
    },
  );
}

const defaultDeps: HIAPCatalogBackfillRunnerDeps = {
  acquireLock: acquireHIAPCatalogBackfillLock,
  releaseLock: releaseHIAPCatalogBackfillLock,
  loadCheckpoint: loadHIAPCatalogBackfillCheckpoint,
  saveCheckpoint: saveHIAPCatalogBackfillCheckpoint,
  processRankingsPage: backfillMissingHIAPRankingsPage,
  processActionPlansPage: backfillMissingHIAPActionPlansPage,
  processMeedRankingsPage: backfillMissingMEEDRankingsPage,
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
  kind: "rankings" | "actionPlans" | "meedRankings",
  processPage:
    | HIAPCatalogBackfillRunnerDeps["processRankingsPage"]
    | HIAPCatalogBackfillRunnerDeps["processMeedRankingsPage"],
  config: HIAPCatalogBackfillConfig,
  checkpoint: HIAPCatalogBackfillCheckpoint,
  saveCheckpoint: HIAPCatalogBackfillRunnerDeps["saveCheckpoint"],
): Promise<{
  totals: BackfillTotals;
  checkpoint: HIAPCatalogBackfillCheckpoint;
  pages: number;
}> {
  const totals = emptyTotals();
  let progress = checkpoint[kind];
  let pages = 0;

  const isContinuousMeed = kind === "meedRankings";
  if (progress.completed && !isContinuousMeed) {
    return { totals, checkpoint, pages };
  }

  while (
    config.maxBatchesPerType === undefined ||
    pages < config.maxBatchesPerType
  ) {
    const page = await processPage({
      limit: config.batchSize,
      cursor: progress.cursor ?? undefined,
      dryRun: config.dryRun,
    });
    pages++;
    addPage(totals, page);

    if (page.hasMore && !page.nextCursor) {
      throw new Error("HIAP catalog backfill page hasMore without nextCursor");
    }

    progress = {
      cursor:
        page.failed > 0
          ? progress.cursor
          : isContinuousMeed
            ? (page.nextCursor ?? progress.cursor)
            : page.hasMore
              ? page.nextCursor
              : null,
      completed: isContinuousMeed ? false : page.failed === 0 && !page.hasMore,
    };
    checkpoint =
      kind === "rankings"
        ? { ...checkpoint, rankings: progress }
        : kind === "actionPlans"
          ? { ...checkpoint, actionPlans: progress }
          : { ...checkpoint, meedRankings: progress };
    await saveCheckpoint(checkpoint);

    if (page.failed > 0 || !page.hasMore) break;
  }

  return { totals, checkpoint, pages };
}

export async function runHIAPCatalogBackfill(
  config: HIAPCatalogBackfillConfig,
  deps: HIAPCatalogBackfillRunnerDeps = defaultDeps,
): Promise<HIAPCatalogBackfillResult> {
  const lock = await deps.acquireLock();
  if (!lock) {
    logger.info("HIAP catalog backfill skipped because another run is active");
    return { skipped: true, pages: 0 };
  }

  try {
    const saveCheckpoint: HIAPCatalogBackfillRunnerDeps["saveCheckpoint"] =
      config.dryRun ? async () => undefined : deps.saveCheckpoint;
    let checkpoint = config.dryRun
      ? emptyCheckpoint()
      : await deps.loadCheckpoint();
    const rankingsRun = await processPages(
      "rankings",
      deps.processRankingsPage,
      config,
      checkpoint,
      saveCheckpoint,
    );
    checkpoint = rankingsRun.checkpoint;
    const actionPlansRun = await processPages(
      "actionPlans",
      deps.processActionPlansPage,
      config,
      checkpoint,
      saveCheckpoint,
    );
    checkpoint = actionPlansRun.checkpoint;
    const meedRankingsRun = await processPages(
      "meedRankings",
      deps.processMeedRankingsPage,
      config,
      checkpoint,
      saveCheckpoint,
    );

    const result = {
      skipped: false,
      pages: rankingsRun.pages + actionPlansRun.pages + meedRankingsRun.pages,
      rankings: rankingsRun.totals,
      actionPlans: actionPlansRun.totals,
      meedRankings: meedRankingsRun.totals,
    } satisfies HIAPCatalogBackfillResult;
    logger.info(result, "HIAP catalog backfill completed");
    return result;
  } finally {
    await deps.releaseLock(lock);
  }
}
