/**
 * CC-1136: the eCRF data source column (e.g. "MEED-CL-2022") becomes the cited
 * source on imported activities and shows in the results breakdown.
 */
import { afterAll, beforeAll, describe, expect, it } from "@jest/globals";
import { randomUUID } from "node:crypto";
import env from "@next/env";
import InventoryImportService from "@/backend/InventoryImportService";
import { getEmissionsBreakdownBatch } from "@/backend/ResultsService";
import { db } from "@/models";
import { City } from "@/models/City";
import { Inventory } from "@/models/Inventory";
import { FILE_IMPORT_SOURCE_TYPE } from "@/util/constants";
import {
  GlobalWarmingPotentialTypeEnum,
  InventoryTypeEnum,
} from "@/util/enums";
import type { ECRFImportResult } from "@/backend/ECRFImportService";

const PREFIX = "XX_CC1136_";
const SOURCE_NAME = `${PREFIX}MEED-CL-2022-${randomUUID().slice(0, 8)}`;

// Same fixed GPC rows the results API test upserts
const STATIONARY_ENERGY_ID = "5da765a9-1ca6-37e1-bcd6-7b387f909a4e";
const RESIDENTIAL_SUBSECTOR_ID = "abe4c7b0-242d-3ed2-a146-48885d6fb38d";
const RESIDENTIAL_SUBCATEGORY_ID = "58a9822a-fae0-3831-9f8b-4ec1fb48a54f";

function importResult(totalCO2e: number): ECRFImportResult {
  return {
    rows: [
      {
        gpcRefNo: "I.1.1",
        sectorId: STATIONARY_ENERGY_ID,
        subsectorId: RESIDENTIAL_SUBSECTOR_ID,
        subcategoryId: RESIDENTIAL_SUBCATEGORY_ID,
        // Not read by the import; required by the row type
        scopeId: randomUUID(),
        totalCO2e,
        activityDataSource: ` ${SOURCE_NAME} `,
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

async function clearInventory(inventoryId: string): Promise<void> {
  const values = await db.models.InventoryValue.findAll({
    where: { inventoryId },
  });
  const valueIds = values.map((value) => value.id);
  if (valueIds.length > 0) {
    await db.models.GasValue.destroy({
      where: { inventoryValueId: valueIds },
    });
    await db.models.ActivityValue.destroy({
      where: { inventoryValueId: valueIds },
    });
  }
  await db.models.InventoryValue.destroy({ where: { inventoryId } });
}

describe("InventoryImportService data source column", () => {
  let city: City;
  const inventories: Inventory[] = [];

  beforeAll(async () => {
    env.loadEnvConfig(process.cwd());
    await db.initialize();

    const sector = await db.models.Sector.findByPk(STATIONARY_ENERGY_ID);
    if (!sector) {
      await db.models.Sector.create({
        sectorId: STATIONARY_ENERGY_ID,
        sectorName: "Stationary Energy",
      });
    }
    await db.models.SubSector.upsert({
      subsectorId: RESIDENTIAL_SUBSECTOR_ID,
      sectorId: STATIONARY_ENERGY_ID,
      subsectorName: "Residential buildings",
    });
    await db.models.SubCategory.upsert({
      subcategoryId: RESIDENTIAL_SUBCATEGORY_ID,
      subsectorId: RESIDENTIAL_SUBSECTOR_ID,
    });

    city = await db.models.City.create({
      cityId: randomUUID(),
      name: `${PREFIX}city`,
      locode: `${PREFIX}${randomUUID().slice(0, 8)}`,
    });
    for (const year of [2022, 2023]) {
      inventories.push(
        await db.models.Inventory.create({
          inventoryId: randomUUID(),
          cityId: city.cityId,
          inventoryName: `${PREFIX}${year}`,
          year,
          totalEmissions: 0,
          inventoryType: InventoryTypeEnum.GPC_BASIC,
          globalWarmingPotentialType: GlobalWarmingPotentialTypeEnum.ar6,
        }),
      );
    }
  });

  afterAll(async () => {
    for (const inventory of inventories) {
      await clearInventory(inventory.inventoryId);
      await db.models.Inventory.destroy({
        where: { inventoryId: inventory.inventoryId },
      });
    }
    await db.models.DataSource.destroy({
      where: { datasourceName: SOURCE_NAME },
    });
    if (city?.cityId) {
      await db.models.City.destroy({ where: { cityId: city.cityId } });
    }
    if (db.sequelize) await db.sequelize.close();
  });

  it("links imported activities to a file_import source and shows it in results", async () => {
    const [inventory] = inventories;
    const summary = await InventoryImportService.importECRFData(
      inventory.inventoryId,
      importResult(1200),
    );
    expect(summary.importedRows).toBe(1);

    const inventoryValue = await db.models.InventoryValue.findOne({
      where: { inventoryId: inventory.inventoryId, gpcReferenceNumber: "I.1.1" },
    });
    // Linking the InventoryValue would turn it into read-only third-party data
    expect(inventoryValue?.datasourceId ?? null).toBeNull();

    const activity = await db.models.ActivityValue.findOne({
      where: { inventoryValueId: inventoryValue!.id },
    });
    const source = await db.models.DataSource.findByPk(activity!.datasourceId!);
    expect(source?.datasourceName).toBe(SOURCE_NAME);
    expect(source?.sourceType).toBe(FILE_IMPORT_SOURCE_TYPE);

    const { byScope } = await getEmissionsBreakdownBatch(
      inventory.inventoryId,
      "stationary-energy",
    );
    const residential = byScope.find(
      (row) => row.activityTitle === "Residential buildings",
    );
    expect(residential?.datasource_name).toBe(SOURCE_NAME);
    expect(residential?.datasource_source_type).toBe(FILE_IMPORT_SOURCE_TYPE);
  });

  it("reuses the same source for later imports with the same name", async () => {
    const [first, second] = inventories;
    await InventoryImportService.importECRFData(
      second.inventoryId,
      importResult(800),
    );

    const sources = await db.models.DataSource.findAll({
      where: { datasourceName: SOURCE_NAME },
    });
    expect(sources).toHaveLength(1);

    const activityIds = await Promise.all(
      [first, second].map(async (inventory) => {
        const value = await db.models.InventoryValue.findOne({
          where: { inventoryId: inventory.inventoryId },
        });
        const activity = await db.models.ActivityValue.findOne({
          where: { inventoryValueId: value!.id },
        });
        return activity?.datasourceId;
      }),
    );
    expect(activityIds).toEqual([
      sources[0].datasourceId,
      sources[0].datasourceId,
    ]);
  });
});
