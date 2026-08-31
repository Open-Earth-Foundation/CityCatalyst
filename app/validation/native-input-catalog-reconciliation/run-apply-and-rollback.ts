import { writeFile } from "node:fs/promises";
import pg from "pg";
import { QueryTypes } from "sequelize";

import { reconcileNativeInputCatalog } from "@/backend/NativeInputCatalogReconciliationService";
import { db } from "@/models";

const { Client } = pg;
const sourceId = "00000000-0000-0000-0000-000000000005";
const pageSize = Number(process.env.RECONCILIATION_PAGE_SIZE ?? "2");
const maxPages = Number(process.env.RECONCILIATION_MAX_PAGES ?? "10");

const required = [
  "DATABASE_HOST",
  "DATABASE_NAME",
  "DATABASE_USER",
  "DATABASE_PASSWORD",
  "VALIDATION_ADMIN_USER",
  "VALIDATION_ADMIN_PASSWORD",
  "VALIDATION_READER_USER",
  "VALIDATION_READER_PASSWORD",
];
for (const key of required) {
  if (!process.env[key]) throw new Error(`${key} is required`);
}

const connectionOptions = (user: string, password: string) => ({
  host: process.env.DATABASE_HOST,
  database: process.env.DATABASE_NAME,
  user,
  password,
});

let repairedCatalogId: string | undefined;
let report: Awaited<ReturnType<typeof reconcileNativeInputCatalog>> | undefined;

async function rollbackCatalogRegistration(id: string): Promise<void> {
  const admin = new Client(
    connectionOptions(
      process.env.VALIDATION_ADMIN_USER!,
      process.env.VALIDATION_ADMIN_PASSWORD!,
    ),
  );
  await admin.connect();
  try {
    const result = await admin.query(
      `DELETE FROM "NativeInputCatalog"
       WHERE id = $1
         AND owning_module = 'ghgi'
         AND source_type = 'imported_inventory_file'
         AND source_id = $2
       RETURNING id`,
      [id, sourceId],
    );
    if (result.rowCount !== 1) {
      throw new Error(
        "Rollback did not remove exactly the created fixture row",
      );
    }
  } finally {
    await admin.end();
  }
}

async function verifyRollback(): Promise<{
  sourceRows: number;
  rolledBackCatalogRows: number;
}> {
  const reader = new Client(
    connectionOptions(
      process.env.VALIDATION_READER_USER!,
      process.env.VALIDATION_READER_PASSWORD!,
    ),
  );
  await reader.connect();
  try {
    const sourceResult = await reader.query(
      `SELECT COUNT(*)::int AS count FROM "ImportedInventoryFile"`,
    );
    const catalogResult = await reader.query(
      `SELECT COUNT(*)::int AS count
       FROM "NativeInputCatalog"
       WHERE source_id = $1`,
      [sourceId],
    );
    return {
      sourceRows: sourceResult.rows[0].count,
      rolledBackCatalogRows: catalogResult.rows[0].count,
    };
  } finally {
    await reader.end();
  }
}

await db.initialize();
await db.sequelize?.authenticate();

try {
  const [privileges] = await db.sequelize!.query<{
    catalogInsert: boolean;
    catalogUpdate: boolean;
    catalogDelete: boolean;
    sourceInsert: boolean;
    sourceUpdate: boolean;
    sourceDelete: boolean;
  }>(
    `SELECT
       has_table_privilege(current_user, 'public."NativeInputCatalog"', 'INSERT') AS "catalogInsert",
       has_table_privilege(current_user, 'public."NativeInputCatalog"', 'UPDATE') AS "catalogUpdate",
       has_table_privilege(current_user, 'public."NativeInputCatalog"', 'DELETE') AS "catalogDelete",
       has_table_privilege(current_user, 'public."ImportedInventoryFile"', 'INSERT') AS "sourceInsert",
       has_table_privilege(current_user, 'public."ImportedInventoryFile"', 'UPDATE') AS "sourceUpdate",
       has_table_privilege(current_user, 'public."ImportedInventoryFile"', 'DELETE') AS "sourceDelete"`,
    { type: QueryTypes.SELECT },
  );

  if (
    !privileges.catalogInsert ||
    !privileges.catalogUpdate ||
    privileges.catalogDelete ||
    privileges.sourceInsert ||
    privileges.sourceUpdate ||
    privileges.sourceDelete
  ) {
    throw new Error("Apply role is broader than catalog-only write access");
  }

  report = await reconcileNativeInputCatalog({
    mode: "apply",
    limit: pageSize,
    maxPages,
  });
  const repaired = report.items.find((item) => item.outcome === "repaired");
  repairedCatalogId = repaired?.catalogId;

  if (!report.complete || report.counts.repaired !== 1 || !repairedCatalogId) {
    throw new Error(
      `Expected exactly one completed repair, received ${JSON.stringify(report.counts)}`,
    );
  }
} finally {
  await db.sequelize?.close();
}

await rollbackCatalogRegistration(repairedCatalogId!);
const verification = await verifyRollback();
if (verification.sourceRows !== 2 || verification.rolledBackCatalogRows !== 0) {
  throw new Error(
    `Rollback verification failed: ${JSON.stringify(verification)}`,
  );
}

const result = {
  apply: {
    complete: report!.complete,
    pagesProcessed: report!.pagesProcessed,
    counts: report!.counts,
    repairedCatalogId,
  },
  rollback: verification,
  sourceMutation: "none",
};
const serializedResult = JSON.stringify(result, null, 2);
console.log(serializedResult);

if (process.env.RECONCILIATION_REPORT_PATH) {
  await writeFile(process.env.RECONCILIATION_REPORT_PATH, serializedResult);
}
