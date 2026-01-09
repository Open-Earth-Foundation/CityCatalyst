import { db } from "@/models";
import createHttpError from "http-errors";
import { randomUUID } from "node:crypto";
import { Op } from "sequelize";

export default class VersionHistoryService {
  static MODELS: Record<string, any> = {
    InventoryValue: db.models.InventoryValue,
    ActivityValue: db.models.ActivityValue,
  };

  static MODEL_ID_COLUMNS: Record<string, string> = {
    InventoryValue: "id",
    ActivityValue: "id",
  };

  static async getVersionHistory(inventoryId: string) {
    const versions = await db.models.Version.findAll({
      where: {
        inventoryId,
      },
      include: [
        {
          model: db.models.User,
          as: "author",
          attributes: ["name", "user_id"],
        },
        {
          model: db.models.Version,
          as: "previousVersion",
        },
      ],
      order: [["created", "DESC"]],
    });

    return versions;
  }

  static async createVersion(
    inventoryId: string,
    table: string,
    entryId: string,
    authorId: string,
    data: Record<string, any>,
  ) {
    // find previous version (if available)
    const previousVersion = await db.models.Version.findOne({
      where: { inventoryId, entryId, table },
      order: [["created", "DESC"]],
    });

    // save version entry
    await db.models.Version.create({
      versionId: randomUUID(),
      inventoryId,
      authorId,
      table,
      entryId,
      previousVersionId: previousVersion?.versionId,
      data,
    });
  }

  static async restoreVersion(versionId: string) {
    const restoredVersion = await db.models.Version.findOne({
      where: {
        versionId,
      },
    });

    if (!restoredVersion) {
      throw new createHttpError.NotFound("version-not-found");
    }

    // revert any versions made after this point
    const newerVersions = await db.models.Version.findAll({
      where: {
        inventoryId: restoredVersion.inventoryId,
        created: { [Op.gt]: restoredVersion?.created },
      },
      include: [{ model: db.models.Version, as: "previousVersion" }],
    });

    await db.sequelize?.transaction(async (transaction) => {
      for (const version of newerVersions) {
        const model = VersionHistoryService.MODELS[version.table!];
        const idColumn = VersionHistoryService.MODEL_ID_COLUMNS[version.table!];
        if (version.previousVersionId) {
          // restore previous version of table entry
          await model.update(version.previousVersion.data as any, {
            where: { [idColumn]: version.entryId },
            transaction,
          });
        } else {
          // delete table entry as it didn't exist previously
          await model.destroy({
            where: {
              [idColumn]: version.entryId,
            },
            transaction,
          });
        }

        // delete version entry
        await version.destroy({ transaction });
      }
    });
  }
}
