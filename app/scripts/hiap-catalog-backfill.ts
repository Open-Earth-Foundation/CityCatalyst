/**
 * Repairs missing HIAP native-input catalog entries in bounded, resumable pages.
 *
 * Run from `app/` with `npm run hiap-catalog-backfill`. The command reads
 * `HIAP_CATALOG_BACKFILL_BATCH_SIZE`, `HIAP_CATALOG_BACKFILL_MAX_BATCHES`, and
 * `HIAP_CATALOG_BACKFILL_DRY_RUN` from the environment. The maximum batch count
 * applies independently to rankings and action plans. Non-dry runs persist both
 * cursors in `HiapCatalogBackfillCheckpoint`; dry runs do not read or write them.
 * It writes repair statistics to the structured logger and updates the database.
 */
import env from "@next/env";

import { db } from "@/models";
import {
  parseHIAPCatalogBackfillConfig,
  runHIAPCatalogBackfill,
} from "@/backend/hiap/HiapCatalogBackfillRunner";
import { logger } from "@/services/logger";

async function main(): Promise<void> {
  env.loadEnvConfig(process.cwd());

  if (!db.initialized) {
    await db.initialize();
  }

  try {
    const result = await runHIAPCatalogBackfill(
      parseHIAPCatalogBackfillConfig(),
    );
    logger.info(result, "HIAP catalog backfill command finished");
  } finally {
    await db.sequelize?.close();
  }
}

main().catch((error) => {
  logger.error({ err: error }, "HIAP catalog backfill command failed");
  process.exitCode = 1;
});
