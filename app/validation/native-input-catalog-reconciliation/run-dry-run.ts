import { writeFile } from "node:fs/promises";
import { QueryTypes } from "sequelize";

import { reconcileNativeInputCatalog } from "@/backend/NativeInputCatalogReconciliationService";
import { db } from "@/models";

const mode = process.env.RECONCILIATION_MODE ?? "dry-run";
if (mode !== "dry-run") {
  throw new Error("The Docker validation harness only permits dry-run mode");
}

const pageSize = Number(process.env.RECONCILIATION_PAGE_SIZE ?? "2");
const maxPages = Number(process.env.RECONCILIATION_MAX_PAGES ?? "10");

await db.initialize();
await db.sequelize?.authenticate();

const [privileges] = await db.sequelize!.query<{
  canInsert: boolean;
  canUpdate: boolean;
  canDelete: boolean;
}>(
  `SELECT
     has_table_privilege(current_user, 'public."NativeInputCatalog"', 'INSERT') AS "canInsert",
     has_table_privilege(current_user, 'public."NativeInputCatalog"', 'UPDATE') AS "canUpdate",
     has_table_privilege(current_user, 'public."NativeInputCatalog"', 'DELETE') AS "canDelete"`,
  { type: QueryTypes.SELECT },
);

if (privileges.canInsert || privileges.canUpdate || privileges.canDelete) {
  throw new Error("Validation database role is not read-only");
}

const report = await reconcileNativeInputCatalog({
  mode: "dry-run",
  limit: pageSize,
  maxPages,
});

const serializedReport = JSON.stringify(report, null, 2);
console.log(serializedReport);

if (process.env.RECONCILIATION_REPORT_PATH) {
  await writeFile(process.env.RECONCILIATION_REPORT_PATH, serializedReport);
}

await db.sequelize?.close();

if (!report.complete) {
  process.exitCode = 2;
}
