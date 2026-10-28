/**
 * Brief: Recalculate inventory ActivityValue / InventoryValue co2eq using each
 * inventory's globalWarmingPotentialType (AR5/AR6 GasToCO2Eq factors).
 *
 * Inputs:
 * - CLI args:
 *   - `--inventory-id <uuid>`: Recalculate one inventory (optional; default all).
 *   - `--dry-run`: Log inventory IDs only; skip writes.
 * - Env vars: Database connection via app Sequelize config (DATABASE_URL / .env).
 *
 * Outputs:
 * - Updates ActivityValue.co2eq / InventoryValue.co2eq in PostgreSQL.
 * - Logs counts of inventories processed.
 *
 * Usage (from app/):
 * - npx tsx scripts/recalculate-inventory-co2eq-gwp.ts
 * - npx tsx scripts/recalculate-inventory-co2eq-gwp.ts --inventory-id <uuid>
 * - npx tsx scripts/recalculate-inventory-co2eq-gwp.ts --dry-run
 */

import env from "@next/env";
import { parseArgs } from "node:util";

import CalculationService from "@/backend/CalculationService";
import { db } from "@/models";
import { logger } from "@/services/logger";

async function main() {
  const projectDir = process.cwd();
  env.loadEnvConfig(projectDir);

  const { values } = parseArgs({
    options: {
      "inventory-id": { type: "string" },
      "dry-run": { type: "boolean", default: false },
    },
  });

  const inventoryId = values["inventory-id"];
  const dryRun = Boolean(values["dry-run"]);

  const inventories = inventoryId
    ? await db.models.Inventory.findAll({
        where: { inventoryId },
        attributes: ["inventoryId", "globalWarmingPotentialType"],
      })
    : await db.models.Inventory.findAll({
        attributes: ["inventoryId", "globalWarmingPotentialType"],
      });

  logger.info(
    { count: inventories.length, dryRun, inventoryId: inventoryId ?? "all" },
    "Starting inventory CO2e recalculation for GWP versions",
  );

  if (dryRun) {
    for (const inventory of inventories) {
      logger.info(
        {
          inventoryId: inventory.inventoryId,
          gwp: inventory.globalWarmingPotentialType ?? "ar5 (default)",
        },
        "Would recalculate inventory",
      );
    }
    return;
  }

  for (const inventory of inventories) {
    const result = await CalculationService.recalculateInventoryCO2eq(
      inventory.inventoryId,
    );
    logger.info(
      {
        inventoryId: inventory.inventoryId,
        gwp: inventory.globalWarmingPotentialType ?? "ar5 (default)",
        ...result,
      },
      "Recalculated inventory",
    );
  }
}

main()
  .catch((err) => {
    logger.error({ err }, "Failed to recalculate inventory CO2e");
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.sequelize?.close();
  });
