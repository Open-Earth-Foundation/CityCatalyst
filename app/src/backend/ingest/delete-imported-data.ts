import { Op } from "sequelize";
import { db } from "@/models";
import VersionHistoryService from "@/backend/VersionHistoryService";
import { INGEST_MODULES, IngestItemError } from "./types";
import { SequelizeIngestDocumentPool } from "./IngestDocumentPoolService";
import { isAmbiguousImportedValue } from "./source-document-ids";

export const DELETE_INCLUDING_DATA_LABEL = "delete-including-data";

function taggedInventoryWhere(documentId: string) {
  return {
    [Op.or]: [
      { sourceDocumentId: documentId },
      { sourceDocumentIds: { [Op.contains]: [documentId] } },
    ],
  };
}

/**
 * Confirmed exception to D9. Withdraws the document and every Path A extract,
 * then removes inventory values created only from that document. Accumulated
 * GPC totals that mix two files cannot be split, so the call is rejected.
 */
export async function deleteImportedDataForDocument(
  documentId: string,
  authorId: string,
): Promise<{ removed: number }> {
  const tagged = await db.models.InventoryValue.findAll({
    where: taggedInventoryWhere(documentId),
  });
  if (tagged.some((value) => isAmbiguousImportedValue(value))) {
    throw new IngestItemError(
      "ambiguous_imported_data",
      "This document shares inventory values with another file. Delete-including-data cannot split an accumulated GPC total.",
    );
  }
  const pool = new SequelizeIngestDocumentPool();
  await pool.withdraw(documentId, {
    withdrawExtractsFor: [...INGEST_MODULES],
  });
  const removed = await removeTaggedInventoryValues(documentId, authorId);
  return { removed };
}

export async function removeTaggedInventoryValues(
  documentId: string,
  authorId: string,
): Promise<number> {
  return db.sequelize!.transaction(async (transaction) => {
    const values = await db.models.InventoryValue.findAll({
      where: taggedInventoryWhere(documentId),
      transaction,
    });
    for (const value of values) {
      const activities = await db.models.ActivityValue.findAll({
        where: { inventoryValueId: value.id },
        transaction,
      });
      const gases = await db.models.GasValue.findAll({
        where: { inventoryValueId: value.id },
        transaction,
      });
      for (const activity of activities) {
        await VersionHistoryService.createVersion(
          value.inventoryId,
          "ActivityValue",
          activity.id,
          authorId,
          activity.toJSON(),
          true,
          transaction,
          "ghgi",
          { label: DELETE_INCLUDING_DATA_LABEL },
        );
        await activity.destroy({ transaction });
      }
      for (const gas of gases) {
        await VersionHistoryService.createVersion(
          value.inventoryId,
          "GasValue",
          gas.id,
          authorId,
          gas.toJSON(),
          true,
          transaction,
          "ghgi",
          { label: DELETE_INCLUDING_DATA_LABEL },
        );
        await gas.destroy({ transaction });
      }
      await VersionHistoryService.createVersion(
        value.inventoryId,
        "InventoryValue",
        value.id,
        authorId,
        value.toJSON(),
        true,
        transaction,
        "ghgi",
        { label: DELETE_INCLUDING_DATA_LABEL },
      );
      await value.destroy({ transaction });
    }
    return values.length;
  });
}
