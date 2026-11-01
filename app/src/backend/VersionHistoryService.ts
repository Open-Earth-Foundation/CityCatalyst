import "@/util/big_int_json";
import { db } from "@/models";
import type { Version } from "@/models/Version";
import { logger } from "@/services/logger";
import { VersionChange } from "@/util/types";
import createHttpError from "http-errors";
import { randomUUID } from "node:crypto";
import { Model, ModelStatic, Op, Transaction } from "sequelize";
import { isDeepStrictEqual } from "node:util";

export default class VersionHistoryService {
  static MODELS: Record<string, ModelStatic<Model>> = {
    // GHGI module
    InventoryValue: db.models.InventoryValue,
    ActivityValue: db.models.ActivityValue,
    GasValue: db.models.GasValue,
    EmissionsFactor: db.models.EmissionsFactor,

    // HIAP module
    HighImpactActionRanked: db.models.HighImpactActionRanked,
    // ActionPlan: db.models.ActionPlan,
    // UnrankedActionSelection: db.models.UnrankedActionSelection,
    // HighImpactActionRanking: db.models.HighImpactActionRanking,
  };

  static MODEL_ID_COLUMNS: Record<string, string> = {
    // GHGI module
    InventoryValue: "id",
    ActivityValue: "id",
    GasValue: "id",
    EmissionsFactor: "id",

    // HIAP module
    HighImpactActionRanked: "id",
    // ActionPlan: "id",
    // UnrankedActionSelection: "id",
    // HighImpactActionRanking: "id",
  };

  static MODULE_HANDLES_DELETIONS: Record<string, boolean> = {
    ghgi: true,
    hiap: false,
  };

  // Parents before children, so foreign keys resolve when deleted rows are re-created.
  static RESTORE_ORDER: string[] = [
    "EmissionsFactor",
    "InventoryValue",
    "ActivityValue",
    "GasValue",
    "HighImpactActionRanked",
  ];

  static async getVersionHistory(
    inventoryId: string,
    moduleName: string = "ghgi",
  ) {
    const versions = (await db.models.Version.findAll({
      where: {
        inventoryId,
        moduleName,
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
    })) as VersionChange[];

    return versions;
  }

  static async createVersion(
    inventoryId: string | undefined,
    table: string,
    entryId: string,
    authorId: string | undefined,
    data: object = {},
    isDeleted: boolean = false,
    transaction?: Transaction,
    moduleName: string = "ghgi",
    options: { label?: string; created?: Date } = {},
  ) {
    if (!inventoryId) {
      throw new createHttpError.BadRequest("missing-inventory-id");
    }
    if (!authorId) {
      throw new createHttpError.BadRequest("missing-user-id");
    }

    // find previous version (if available); inside the caller's transaction so a
    // version written earlier in the same transaction is linked too
    const previousVersion = await db.models.Version.findOne({
      where: { inventoryId, entryId, table, moduleName },
      order: [["created", "DESC"]],
      transaction,
    });

    // a deletion is a change even when it carries the same data as the previous
    // version, and so is a labelled version (e.g. the snapshot before an import replace)
    if (
      !isDeleted &&
      !previousVersion?.isDeleted &&
      (previousVersion?.label ?? null) === (options.label ?? null) &&
      isDeepStrictEqual(previousVersion?.data, data)
    ) {
      logger.warn(
        { moduleName, table, inventoryId, entryId },
        "createVersion called with same data, skipping",
      );
      return;
    }

    // save version entry
    return await db.models.Version.create(
      {
        versionId: randomUUID(),
        inventoryId,
        authorId,
        table,
        moduleName,
        entryId,
        previousVersionId: previousVersion?.versionId,
        data: data as Record<string, unknown>,
        isDeleted,
        label: options.label,
        // an explicit time lets a bulk operation share one restore point
        ...(options.created ? { created: options.created } : {}),
      },
      { transaction },
    );
  }

  static bulkCreateVersions(
    inventoryId: string | undefined,
    table: string,
    authorId: string | undefined,
    dataEntries: object[],
    isDeleted: boolean = false,
    transaction?: Transaction,
    moduleName: string = "ghgi",
  ) {
    return Promise.all(
      dataEntries.map((entry) => {
        return this.createVersion(
          inventoryId,
          table,
          (entry as Record<string, unknown>)[
            this.MODEL_ID_COLUMNS[table]
          ] as string,
          authorId,
          entry,
          isDeleted,
          transaction,
          moduleName,
        );
      }),
    );
  }

  /**
   * Jumps the inventory back to the state it had at the given version. Every
   * entry changed after that point is put back to its state at that point
   * (updated, re-created, or deleted if it did not exist yet), and the newer
   * version entries are removed, so there is no undo.
   *
   * @param versionId - version to restore to
   * @param inventoryId - inventory the caller was authorized for; the version must belong to it
   */
  static async restoreVersion(versionId: string, inventoryId: string) {
    const restoredVersion = await db.models.Version.findOne({
      where: {
        versionId,
        inventoryId,
      },
    });

    if (!restoredVersion) {
      throw new createHttpError.NotFound("version-not-found");
    }

    // revert any versions made after this point, oldest first
    const newerVersions = await db.models.Version.findAll({
      where: {
        inventoryId: restoredVersion.inventoryId,
        created: { [Op.gt]: restoredVersion?.created },
        moduleName: restoredVersion.moduleName,
      },
      order: [["created", "ASC"]],
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

    const moduleName = restoredVersion.moduleName;
    const moduleHandlesDeletions = moduleName
      ? (VersionHistoryService.MODULE_HANDLES_DELETIONS[moduleName] ?? true)
      : true;

    // The oldest newer version of each entry points at the entry's state at the
    // restore point (its previous version), so later changes to it don't matter.
    const firstChangeByEntry = new Map<string, Version>();
    for (const version of newerVersions) {
      const key = `${version.table}:${version.entryId}`;
      if (!firstChangeByEntry.has(key)) {
        firstChangeByEntry.set(key, version);
      }
    }
    const restoreRank = (table?: string) => {
      const rank = VersionHistoryService.RESTORE_ORDER.indexOf(table ?? "");
      return rank === -1 ? VersionHistoryService.RESTORE_ORDER.length : rank;
    };
    const existedAtRestorePoint = (version: Version) =>
      !!version.previousVersion &&
      !version.previousVersion.isDeleted &&
      !!version.previousVersion.data;
    const firstChanges = [...firstChangeByEntry.values()];
    // Entries created after the restore point are removed first (children
    // first), so re-created entries don't collide with them on unique keys
    // such as one InventoryValue per GPC reference number.
    const toRemove = firstChanges
      .filter((version) => !existedAtRestorePoint(version))
      .sort((a, b) => restoreRank(b.table) - restoreRank(a.table));
    const toRestore = firstChanges
      .filter(existedAtRestorePoint)
      .sort((a, b) => restoreRank(a.table) - restoreRank(b.table));

    const modelFor = (version: Version) => {
      const model = VersionHistoryService.MODELS[version.table!];
      const idColumn = VersionHistoryService.MODEL_ID_COLUMNS[version.table!];
      if (!model || !idColumn) {
        throw new createHttpError.InternalServerError(
          "table-model-not-configured: " + version.table!,
        );
      }
      return { model, idColumn };
    };

    await db.sequelize?.transaction(async (transaction) => {
      if (moduleHandlesDeletions) {
        for (const version of toRemove) {
          const { model, idColumn } = modelFor(version);
          await model.destroy({
            where: { [idColumn]: version.entryId },
            transaction,
          });
        }
      }

      for (const version of toRestore) {
        const { model, idColumn } = modelFor(version);
        const previousData = version.previousVersion.data!;
        // restore the entry's earlier state, re-creating it if it was deleted since
        const [updatedCount] = await model.update(previousData, {
          where: { [idColumn]: version.entryId },
          transaction,
        });
        if (updatedCount === 0) {
          await model.create(previousData, { transaction });
        }
      }

      // one statement, so newer versions that point at each other go together
      await db.models.Version.destroy({
        where: {
          versionId: newerVersions.map((version) => version.versionId),
        },
        transaction,
      });
    });
  }
}
