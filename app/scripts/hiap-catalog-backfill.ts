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
