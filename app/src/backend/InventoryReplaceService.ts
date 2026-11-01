import { Op, Transaction } from "sequelize";
import { db } from "@/models";
import VersionHistoryService from "@/backend/VersionHistoryService";

/** Version label for the snapshot of the data that a file import replaced. */
export const IMPORT_REPLACE_BEFORE_LABEL = "import-replace-before";
/** Version label for the deletions and new values written by that import. */
export const IMPORT_REPLACE_LABEL = "import-replace";

export interface ReplaceInventoryValuesResult {
  /** Version to restore to get the replaced data back; null when there was nothing to replace. */
  restoreVersionId: string | null;
  removedInventoryValues: number;
  removedActivityValues: number;
}

/**
 * Removes all GHGI values of an inventory (manual entries, connected
 * third-party data, and NE/NO notation keys) before a file replaces them.
 *
 * The removed data stays restorable from the inventory's version history:
 * every row first gets a snapshot version (label `import-replace-before`, one
 * shared timestamp, so the history shows it as one restorable entry), then a
 * deletion version (label `import-replace`). Rows from earlier file imports
 * have no versions of their own, which is why the snapshot is needed.
 *
 * Must run inside the caller's transaction, together with the import, so a
 * failed import leaves the old data in place.
 */
export default class InventoryReplaceService {
  public static async replaceInventoryValues(
    inventoryId: string,
    authorId: string,
    transaction: Transaction,
  ): Promise<ReplaceInventoryValuesResult> {
    const inventoryValues = await db.models.InventoryValue.findAll({
      where: { inventoryId },
      transaction,
    });
    if (inventoryValues.length === 0) {
      return {
        restoreVersionId: null,
        removedInventoryValues: 0,
        removedActivityValues: 0,
      };
    }

    const inventoryValueIds = inventoryValues.map((value) => value.id);
    const activityValues = await db.models.ActivityValue.findAll({
      where: { inventoryValueId: inventoryValueIds },
      transaction,
    });
    const activityValueIds = activityValues.map((value) => value.id);
    const gasValues = await db.models.GasValue.findAll({
      where: {
        [Op.or]: [
          { inventoryValueId: inventoryValueIds },
          ...(activityValueIds.length > 0
            ? [{ activityValueId: activityValueIds }]
            : []),
        ],
      },
      transaction,
    });

    const rows: Array<{ table: string; id: string; data: object }> = [
      ...inventoryValues.map((row) => ({
        table: "InventoryValue",
        id: row.id,
        data: row.toJSON(),
      })),
      ...activityValues.map((row) => ({
        table: "ActivityValue",
        id: row.id,
        data: row.toJSON(),
      })),
      ...gasValues.map((row) => ({
        table: "GasValue",
        id: row.id,
        data: row.toJSON(),
      })),
    ];

    // Deletions get a later time than the snapshot, so restoring to the
    // snapshot reverts them even when both are written in the same millisecond.
    const snapshotTime = new Date();
    const deletionTime = new Date(snapshotTime.getTime() + 1);

    let restoreVersionId: string | null = null;
    for (const row of rows) {
      const snapshot = await VersionHistoryService.createVersion(
        inventoryId,
        row.table,
        row.id,
        authorId,
        row.data,
        false,
        transaction,
        "ghgi",
        { label: IMPORT_REPLACE_BEFORE_LABEL, created: snapshotTime },
      );
      restoreVersionId = snapshot?.versionId ?? restoreVersionId;
    }
    for (const row of rows) {
      await VersionHistoryService.createVersion(
        inventoryId,
        row.table,
        row.id,
        authorId,
        row.data,
        true,
        transaction,
        "ghgi",
        { label: IMPORT_REPLACE_LABEL, created: deletionTime },
      );
    }

    // ActivityValue and GasValue rows go with their InventoryValue (ON DELETE CASCADE)
    await db.models.InventoryValue.destroy({
      where: { inventoryId },
      transaction,
    });

    return {
      restoreVersionId,
      removedInventoryValues: inventoryValues.length,
      removedActivityValues: activityValues.length,
    };
  }
}
