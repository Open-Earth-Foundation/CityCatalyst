/**
 * CC-1112: replacing an inventory's data with a file import, and restoring the
 * replaced data from version history.
 */
import { afterAll, beforeAll, describe, expect, it } from "@jest/globals";
import { randomUUID } from "node:crypto";
import env from "@next/env";
import InventoryImportService from "@/backend/InventoryImportService";
import InventoryReplaceService, {
  IMPORT_REPLACE_BEFORE_LABEL,
  IMPORT_REPLACE_LABEL,
  type ReplaceInventoryValuesResult,
} from "@/backend/InventoryReplaceService";
import VersionHistoryService from "@/backend/VersionHistoryService";
import type { ECRFImportResult } from "@/backend/ECRFImportService";
import { db } from "@/models";
import { City } from "@/models/City";
import { Inventory } from "@/models/Inventory";
import { Sector } from "@/models/Sector";
import { SubSector } from "@/models/SubSector";
import { SubCategory } from "@/models/SubCategory";
import { Scope } from "@/models/init-models";
import {
  GlobalWarmingPotentialTypeEnum,
  InventoryTypeEnum,
} from "@/util/enums";

const PREFIX = "XX_CC1112_";
const EMISSIONS_REF = "XX.CC1112.1";
const NOTATION_REF = "XX.CC1112.2";
const userId = randomUUID();

describe("InventoryReplaceService", () => {
  let city: City;
  let inventory: Inventory;
  let sector: Sector;
  let subsector: SubSector;
  let subcategory: SubCategory;
  let scope: Scope;

  function fileWithEmissions(totalCO2e: number): ECRFImportResult {
    return {
      rows: [
        {
          gpcRefNo: EMISSIONS_REF,
          sectorId: sector.sectorId,
          subsectorId: subsector.subsectorId,
          subcategoryId: subcategory.subcategoryId,
          scopeId: scope.scopeId,
          totalCO2e,
          activityAmount: 10,
          activityUnit: "l",
          rowIndex: 0,
        },
      ],
      errors: [],
      warnings: [],
      rowCount: 1,
      validRowCount: 1,
      rowsSkippedEmptyEmissions: 0,
    };
  }

  async function inventoryState(inventoryId: string) {
    const values = await db.models.InventoryValue.findAll({
      where: { inventoryId },
      order: [["gpcReferenceNumber", "ASC"]],
    });
    const activities = await db.models.ActivityValue.findAll({
      where: { inventoryValueId: values.map((value) => value.id) },
    });
    return { values, activities };
  }

  async function removeInventory(inventoryId: string) {
    await db.models.InventoryValue.destroy({ where: { inventoryId } });
    await db.models.Version.destroy({ where: { inventoryId } });
    await db.models.Inventory.destroy({ where: { inventoryId } });
  }

  beforeAll(async () => {
    env.loadEnvConfig(process.cwd());
    await db.initialize();

    await db.models.User.create({ userId, name: `${PREFIX}user` });
    city = await db.models.City.create({
      cityId: randomUUID(),
      name: `${PREFIX}city`,
      locode: `${PREFIX}${randomUUID().slice(0, 8)}`,
    });
    inventory = await db.models.Inventory.create({
      inventoryId: randomUUID(),
      cityId: city.cityId,
      inventoryName: `${PREFIX}inventory`,
      year: 2023,
      totalEmissions: 0,
      inventoryType: InventoryTypeEnum.GPC_BASIC,
      globalWarmingPotentialType: GlobalWarmingPotentialTypeEnum.ar6,
    });
    sector = await db.models.Sector.create({
      sectorId: randomUUID(),
      sectorName: `${PREFIX}sector`,
    });
    scope = await db.models.Scope.create({
      scopeId: randomUUID(),
      scopeName: "1",
    });
    subsector = await db.models.SubSector.create({
      subsectorId: randomUUID(),
      sectorId: sector.sectorId,
      subsectorName: `${PREFIX}subsector`,
      scopeId: scope.scopeId,
    });
    subcategory = await db.models.SubCategory.create({
      subcategoryId: randomUUID(),
      subsectorId: subsector.subsectorId,
      subcategoryName: `${PREFIX}subcategory`,
      referenceNumber: EMISSIONS_REF,
      scopeId: scope.scopeId,
    });

    // Existing data: an earlier file import (which wrote no versions) and a notation key
    await InventoryImportService.importECRFData(
      inventory.inventoryId,
      fileWithEmissions(100),
      { defaultActivityDataSource: "CC-1112 fixture" },
    );
    await db.models.InventoryValue.create({
      id: randomUUID(),
      inventoryId: inventory.inventoryId,
      gpcReferenceNumber: NOTATION_REF,
      sectorId: sector.sectorId,
      subSectorId: subsector.subsectorId,
      subCategoryId: subcategory.subcategoryId,
      unavailableReason: "no-occurrance",
      unavailableExplanation: "Does not occur in the city",
    });
  });

  afterAll(async () => {
    if (inventory?.inventoryId) {
      await removeInventory(inventory.inventoryId);
    }
    if (subcategory?.subcategoryId) {
      await db.models.SubCategory.destroy({
        where: { subcategoryId: subcategory.subcategoryId },
      });
    }
    if (subsector?.subsectorId) {
      await db.models.SubSector.destroy({
        where: { subsectorId: subsector.subsectorId },
      });
    }
    if (sector?.sectorId) {
      await db.models.Sector.destroy({ where: { sectorId: sector.sectorId } });
    }
    if (scope?.scopeId) {
      await db.models.Scope.destroy({ where: { scopeId: scope.scopeId } });
    }
    if (city?.cityId) {
      await db.models.City.destroy({ where: { cityId: city.cityId } });
    }
    await db.models.User.destroy({ where: { userId } });
    if (db.sequelize) {
      await db.sequelize.close();
    }
  });

  it("keeps the old data and writes no versions when the transaction rolls back", async () => {
    const before = await inventoryState(inventory.inventoryId);

    await expect(
      db.sequelize!.transaction(async (transaction) => {
        await InventoryReplaceService.replaceInventoryValues(
          inventory.inventoryId,
          userId,
          transaction,
        );
        throw new Error("import failed");
      }),
    ).rejects.toThrow("import failed");

    const after = await inventoryState(inventory.inventoryId);
    expect(after.values.map((value) => value.id)).toEqual(
      before.values.map((value) => value.id),
    );
    expect(
      await db.models.Version.count({
        where: { inventoryId: inventory.inventoryId },
      }),
    ).toBe(0);
  });

  describe("replace, then restore", () => {
    let originalValueIds: string[];
    let originalActivityIds: string[];
    let replaced: ReplaceInventoryValuesResult;

    it("replaces all existing values, including notation keys and earlier imports", async () => {
      const before = await inventoryState(inventory.inventoryId);
      originalValueIds = before.values.map((value) => value.id);
      originalActivityIds = before.activities.map((activity) => activity.id);
      expect(originalValueIds).toHaveLength(2);
      expect(originalActivityIds).toHaveLength(1);

      const result = await db.sequelize!.transaction(async (transaction) => {
        const replaceResult =
          await InventoryReplaceService.replaceInventoryValues(
            inventory.inventoryId,
            userId,
            transaction,
          );
        const summary = await InventoryImportService.importECRFData(
          inventory.inventoryId,
          fileWithEmissions(300),
          {
            defaultActivityDataSource: "CC-1112 fixture",
            authorId: userId,
            versionLabel: IMPORT_REPLACE_LABEL,
            transaction,
          },
        );
        return { replaceResult, summary };
      });
      replaced = result.replaceResult;

      expect(result.summary.importedRows).toBe(1);
      expect(replaced.removedInventoryValues).toBe(2);
      expect(replaced.removedActivityValues).toBe(1);
      expect(replaced.restoreVersionId).not.toBeNull();

      const after = await inventoryState(inventory.inventoryId);
      expect(after.values).toHaveLength(1);
      expect(after.values[0].gpcReferenceNumber).toBe(EMISSIONS_REF);
      expect(originalValueIds).not.toContain(after.values[0].id);
      expect(BigInt(after.values[0].co2eq as unknown as string)).toBe(300000n);

      // the snapshot of the old data is the labelled restore point
      const restorePoint = await db.models.Version.findByPk(
        replaced.restoreVersionId!,
      );
      expect(restorePoint?.label).toBe(IMPORT_REPLACE_BEFORE_LABEL);
      expect(
        await db.models.Version.count({
          where: {
            inventoryId: inventory.inventoryId,
            label: IMPORT_REPLACE_LABEL,
            isDeleted: false,
          },
        }),
      ).toBeGreaterThan(0);

      // Snapshot and deletion share one restore point: deletions are written
      // with created = snapshotTime + 1ms. Assert that against the DB so a
      // Sequelize change that ignored the explicit created would fail here.
      const snapshotVersions = await db.models.Version.findAll({
        where: {
          inventoryId: inventory.inventoryId,
          label: IMPORT_REPLACE_BEFORE_LABEL,
        },
      });
      const deletionVersions = await db.models.Version.findAll({
        where: {
          inventoryId: inventory.inventoryId,
          label: IMPORT_REPLACE_LABEL,
          isDeleted: true,
        },
      });
      expect(snapshotVersions.length).toBeGreaterThan(0);
      expect(deletionVersions.length).toBe(snapshotVersions.length);
      const snapshotCreated = new Date(snapshotVersions[0].created!).getTime();
      for (const version of snapshotVersions) {
        expect(new Date(version.created!).getTime()).toBe(snapshotCreated);
      }
      for (const version of deletionVersions) {
        expect(new Date(version.created!).getTime()).toBe(snapshotCreated + 1);
      }
    });

    it("rejects restoring the version through another inventory", async () => {
      await expect(
        VersionHistoryService.restoreVersion(
          replaced.restoreVersionId!,
          randomUUID(),
        ),
      ).rejects.toThrow("version-not-found");
    });

    it("brings back the replaced data and removes the imported data on restore", async () => {
      await VersionHistoryService.restoreVersion(
        replaced.restoreVersionId!,
        inventory.inventoryId,
      );

      const restored = await inventoryState(inventory.inventoryId);
      expect(restored.values.map((value) => value.id).sort()).toEqual(
        [...originalValueIds].sort(),
      );
      expect(restored.activities.map((activity) => activity.id)).toEqual(
        originalActivityIds,
      );

      const emissions = restored.values.find(
        (value) => value.gpcReferenceNumber === EMISSIONS_REF,
      );
      expect(BigInt(emissions!.co2eq as unknown as string)).toBe(100000n);
      const notation = restored.values.find(
        (value) => value.gpcReferenceNumber === NOTATION_REF,
      );
      expect(notation?.unavailableReason).toBe("no-occurrance");
    });
  });

  it("returns no restore point when the inventory is empty", async () => {
    const emptyInventory = await db.models.Inventory.create({
      inventoryId: randomUUID(),
      cityId: city.cityId,
      inventoryName: `${PREFIX}empty`,
      year: 2022,
      totalEmissions: 0,
      inventoryType: InventoryTypeEnum.GPC_BASIC,
      globalWarmingPotentialType: GlobalWarmingPotentialTypeEnum.ar6,
    });
    try {
      const result = await db.sequelize!.transaction((transaction) =>
        InventoryReplaceService.replaceInventoryValues(
          emptyInventory.inventoryId,
          userId,
          transaction,
        ),
      );
      expect(result).toEqual({
        restoreVersionId: null,
        removedInventoryValues: 0,
        removedActivityValues: 0,
      });
    } finally {
      await removeInventory(emptyInventory.inventoryId);
    }
  });
});
