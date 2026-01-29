import { db } from "@/models";
import createHttpError from "http-errors";
import { randomUUID } from "node:crypto";
import { Op, Transaction } from "sequelize";

export default class VersionHistoryService {
  static MODELS: Record<string, any> = {
    InventoryValue: db.models.InventoryValue,
    ActivityValue: db.models.ActivityValue,
    GasValue: db.models.GasValue,
    EmissionsFactor: db.models.EmissionsFactor,
  };

  static MODEL_ID_COLUMNS: Record<string, string> = {
    InventoryValue: "id",
    ActivityValue: "id",
    GasValue: "id",
    EmissionsFactor: "id",
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
          attributes: ["name", "userId"],
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
    inventoryId: string | undefined,
    table: string,
    entryId: string,
    authorId: string | undefined,
    data: Record<string, any> = {},
    isDeleted: boolean = false,
    transaction?: Transaction,
  ) {
    if (!inventoryId) {
      throw new createHttpError.BadRequest("missing-inventory-id");
    }
    if (!authorId) {
      throw new createHttpError.BadRequest("missing-user-id");
    }

    // find previous version (if available)
    const previousVersion = await db.models.Version.findOne({
      where: { inventoryId, entryId, table },
      order: [["created", "DESC"]],
    });

    // save version entry
    await db.models.Version.create(
      {
        versionId: randomUUID(),
        inventoryId,
        authorId,
        table,
        entryId,
        previousVersionId: previousVersion?.versionId,
        data,
        isDeleted,
      },
      { transaction },
    );
  }

  static bulkCreateVersions(
    inventoryId: string | undefined,
    table: string,
    authorId: string | undefined,
    dataEntries: Record<string, any>[],
    isDeleted: boolean = false,
    transaction?: Transaction,
  ) {
    return Promise.all(
      dataEntries.map((entry) => {
        return this.createVersion(
          inventoryId,
          table,
          entry[this.MODEL_ID_COLUMNS[table]],
          authorId,
          entry,
          isDeleted,
          transaction,
        );
      }),
    );
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
      include: [
        {
          model: db.models.Version,
          as: "previousVersion",
          foreignKey: "previousVersionId",
        },
      ],
    });

    if (newerVersions.length == 0) {
      throw new createHttpError.BadRequest("no-newer-versions-found");
    }

    await db.sequelize?.transaction(async (transaction) => {
      for (const version of newerVersions) {
        const model = VersionHistoryService.MODELS[version.table!];
        const idColumn = VersionHistoryService.MODEL_ID_COLUMNS[version.table!];
        if (
          version.previousVersion &&
          !version.previousVersion?.isDeleted &&
          version.previousVersion?.data
        ) {
          // re-create entry in case it was deleted previously
          if (version.isDeleted) {
            await model.create(version.previousVersion.data, {
              transaction,
            });
          } else {
            // restore previous version of table entry
            await model.update(version.previousVersion.data, {
              where: { [idColumn]: version.entryId },
              transaction,
            });
          }
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
