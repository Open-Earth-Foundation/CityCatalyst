/**
 * CC-1060 PR 2: clear the creator userId of HIAP and HIAP-MEED catalog rows and
 * fill missing projectId/organizationId from the row's city. Idempotent.
 *
 * Run from `app/` with `npm run native-input-catalog-scope-backfill`.
 * Environment: `CATALOG_SCOPE_BACKFILL_DRY_RUN` (default true: set to `false`
 * to write), `CATALOG_SCOPE_BACKFILL_BATCH_SIZE` (default 100),
 * `CATALOG_SCOPE_BACKFILL_MAX_BATCHES`. Needs David's go-ahead per environment.
 */
import env from "@next/env";

import { db } from "@/models";
import { runCatalogScopeBackfill } from "@/backend/NativeInputCatalogScopeBackfill";
import { logger } from "@/services/logger";

async function main(): Promise<void> {
  env.loadEnvConfig(process.cwd());
  if (!db.initialized) await db.initialize();

  try {
    const maxBatches = process.env.CATALOG_SCOPE_BACKFILL_MAX_BATCHES;
    const result = await runCatalogScopeBackfill({
      batchSize: Number(process.env.CATALOG_SCOPE_BACKFILL_BATCH_SIZE ?? 100),
      dryRun: process.env.CATALOG_SCOPE_BACKFILL_DRY_RUN !== "false",
      ...(maxBatches ? { maxBatches: Number(maxBatches) } : {}),
    });
    logger.info(result, "Catalog scope backfill finished");
  } finally {
    await db.sequelize?.close();
  }
}

main().catch((error) => {
  logger.error({ err: error }, "Catalog scope backfill failed");
  process.exitCode = 1;
});
