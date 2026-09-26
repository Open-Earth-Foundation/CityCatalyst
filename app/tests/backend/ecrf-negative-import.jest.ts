/**
 * IMP-013: persist negative eCRF totalCO2e (tonnes → kg) on InventoryValue / ActivityValue.
 */
import {
  afterAll,
  beforeAll,
  describe,
  expect,
  it,
} from "@jest/globals";
import { randomUUID } from "node:crypto";
import env from "@next/env";
import InventoryImportService from "@/backend/InventoryImportService";
import { getEmissionResults } from "@/backend/ResultsService";
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
import type { ECRFImportResult } from "@/backend/ECRFImportService";

const PREFIX = "XX_IMP013_";
const locode = `${PREFIX}${randomUUID().slice(0, 8)}`;

describe("InventoryImportService negative totalCO2e", () => {
  let city: City;
  let inventory: Inventory;
  let sector: Sector;
  let subsector: SubSector;
  let subcategory: SubCategory;
  let scope: Scope;

  beforeAll(async () => {
    env.loadEnvConfig(process.cwd());
    await db.initialize();

    city = await db.models.City.create({
      cityId: randomUUID(),
      name: `${PREFIX}city`,
      locode,
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
      sectorName: `${PREFIX}AFOLU`,
    });
    scope = await db.models.Scope.create({
      scopeId: randomUUID(),
      scopeName: "1",
    });
    subsector = await db.models.SubSector.create({
      subsectorId: randomUUID(),
      sectorId: sector.sectorId,
      subsectorName: `${PREFIX}land`,
      scopeId: scope.scopeId,
    });
    subcategory = await db.models.SubCategory.create({
      subcategoryId: randomUUID(),
      subsectorId: subsector.subsectorId,
      subcategoryName: `${PREFIX}land-remaining`,
      referenceNumber: "XX.IMP013",
      scopeId: scope.scopeId,
    });
  });

  afterAll(async () => {
    if (inventory?.inventoryId) {
      const values = await db.models.InventoryValue.findAll({
        where: { inventoryId: inventory.inventoryId },
      });
      const valueIds = values.map((v) => v.id);
      if (valueIds.length > 0) {
        await db.models.GasValue.destroy({
          where: { inventoryValueId: valueIds },
        });
        await db.models.ActivityValue.destroy({
          where: { inventoryValueId: valueIds },
        });
      }
      await db.models.InventoryValue.destroy({
        where: { inventoryId: inventory.inventoryId },
      });
      await db.models.Inventory.destroy({
        where: { inventoryId: inventory.inventoryId },
      });
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
      await db.models.CityUser.destroy({
        where: { cityId: city.cityId },
      }).catch(() => undefined);
      await db.models.City.destroy({ where: { cityId: city.cityId } });
    }
    if (db.sequelize) {
      await db.sequelize.close();
    }
  });

  it("stores negative kg on inventory and activity values and results removals", async () => {
    const importResult: ECRFImportResult = {
      rows: [
        {
          gpcRefNo: "XX.IMP013",
          sectorId: sector.sectorId,
          subsectorId: subsector.subsectorId,
          subcategoryId: subcategory.subcategoryId,
          scopeId: scope.scopeId,
          totalCO2e: -239.5,
          activityAmount: 10,
          activityUnit: "ha",
          rowIndex: 0,
        },
      ],
      errors: [],
      warnings: [],
      rowCount: 1,
      validRowCount: 1,
    };

    const summary = await InventoryImportService.importECRFData(
      inventory.inventoryId,
      importResult,
      { defaultActivityDataSource: "IMP-013 fixture" },
    );
    expect(summary.importedRows).toBe(1);
    expect(summary.skippedRows).toBe(0);

    const inventoryValue = await db.models.InventoryValue.findOne({
      where: {
        inventoryId: inventory.inventoryId,
        gpcReferenceNumber: "XX.IMP013",
      },
    });
    expect(inventoryValue).not.toBeNull();
    expect(BigInt(inventoryValue!.co2eq as unknown as string)).toBe(-239500n);

    const activity = await db.models.ActivityValue.findOne({
      where: { inventoryValueId: inventoryValue!.id },
    });
    expect(activity).not.toBeNull();
    expect(BigInt(activity!.co2eq as unknown as string)).toBe(-239500n);

    const results = await getEmissionResults(inventory.inventoryId);
    expect(results.removals?.toNumber()).toBe(-239500);
    expect(results.grossEmissions?.toNumber()).toBe(0);
    expect(results.totalEmissions.toNumber()).toBe(-239500);
  });

  it("skips totalCO2e 0 as empty rather than a removal", async () => {
    const otherInventory = await db.models.Inventory.create({
      inventoryId: randomUUID(),
      cityId: city.cityId,
      inventoryName: `${PREFIX}zero`,
      year: 2022,
      totalEmissions: 0,
      inventoryType: InventoryTypeEnum.GPC_BASIC,
      globalWarmingPotentialType: GlobalWarmingPotentialTypeEnum.ar6,
    });
    try {
      const summary = await InventoryImportService.importECRFData(
        otherInventory.inventoryId,
        {
          rows: [
            {
              gpcRefNo: "XX.IMP013",
              sectorId: sector.sectorId,
              subsectorId: subsector.subsectorId,
              subcategoryId: subcategory.subcategoryId,
              scopeId: scope.scopeId,
              totalCO2e: 0,
              rowIndex: 0,
            },
          ],
          errors: [],
          warnings: [],
          rowCount: 1,
          validRowCount: 1,
        },
      );
      expect(summary.importedRows).toBe(0);
      expect(summary.skippedRows).toBe(1);
      const count = await db.models.InventoryValue.count({
        where: { inventoryId: otherInventory.inventoryId },
      });
      expect(count).toBe(0);
    } finally {
      await db.models.InventoryValue.destroy({
        where: { inventoryId: otherInventory.inventoryId },
      });
      await db.models.Inventory.destroy({
        where: { inventoryId: otherInventory.inventoryId },
      });
    }
  });
});
