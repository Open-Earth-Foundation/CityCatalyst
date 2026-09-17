/**
 * IMP-007: createMissingCities creates city + inventory shells, then the
 * worker imports. A second run does not duplicate the city.
 */
import { afterAll, beforeAll, describe, expect, it, jest } from "@jest/globals";
import { randomUUID } from "node:crypto";
import { loadEnvConfig } from "@next/env";
import { db } from "@/models";
import { Roles } from "@/util/types";
import {
  BulkInventoryImportItemStatus,
  GlobalWarmingPotentialTypeEnum,
  InventoryTypeEnum,
} from "@/util/enums";
import { DEFAULT_PROJECT_ID } from "@/util/constants";
import { BulkInventoryImportEnqueueService } from "@/backend/BulkInventoryImportEnqueueService";
import { createBulkInventoryImportZip } from "@/backend/BulkInventoryImportZip";
import { BulkInventoryImportWorkerService } from "@/backend/BulkInventoryImportWorkerService";
import OpenClimateService from "@/backend/OpenClimateService";
import { formatStoredLocode } from "@/backend/BulkInventoryImportMatcher";

const testUserID = "beb9634a-b68c-4c1b-a20b-2ab0ced5e3c2";
const PREFIX = `XX_IMP007_${randomUUID().slice(0, 8)}`;
const GPC_REF = `${PREFIX}.1.1`;

function lettersFromUuid(count: number): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const hex = randomUUID().replace(/-/g, "");
  let out = "";
  for (let i = 0; i < count; i++) {
    out += alphabet[parseInt(hex[i * 2] ?? "0", 16) % alphabet.length];
  }
  return out;
}

function ecrfCsv(totalCO2e: number): string {
  return [
    "GPC ref. no.,CRF - Sector,CRF - Sub-sector,Scope,GHGs (metric tonnes CO2e) - Total CO2e",
    `${GPC_REF},Stationary Energy,Residential Buildings,1,${totalCO2e}`,
    "",
  ].join("\n");
}

describe("Bulk inventory import createMissingCities", () => {
  const createdCityIds: string[] = [];
  const jobIds: string[] = [];
  let sectorId: string;
  let subsectorId: string;
  let subcategoryId: string;
  let createdScopeId: string | null = null;
  const locodeToken = lettersFromUuid(3);
  const locode = formatStoredLocode(`XX-${locodeToken}`);
  const nameOnlyCity = `${PREFIX}_Ghost`;

  beforeAll(async () => {
    loadEnvConfig(process.cwd());
    await db.initialize();
    await db.models.User.upsert({
      userId: testUserID,
      name: "Test User",
      email: "test@example.com",
      role: Roles.Admin,
    });

    jest
      .spyOn(OpenClimateService, "getCityName")
      .mockResolvedValue(null as never);
    jest
      .spyOn(OpenClimateService, "getPopulationData")
      .mockResolvedValue({ error: "skip" } as never);

    let scope = await db.models.Scope.findOne({ where: { scopeName: "1" } });
    if (!scope) {
      scope = await db.models.Scope.create({
        scopeId: randomUUID(),
        scopeName: "1",
      });
      createdScopeId = scope.scopeId;
    }

    const sector = await db.models.Sector.create({
      sectorId: randomUUID(),
      sectorName: `${PREFIX} AFOLU`,
    });
    sectorId = sector.sectorId;
    const subsector = await db.models.SubSector.create({
      subsectorId: randomUUID(),
      sectorId: sector.sectorId,
      subsectorName: `${PREFIX} land`,
      scopeId: scope.scopeId,
    });
    subsectorId = subsector.subsectorId;
    const subcategory = await db.models.SubCategory.create({
      subcategoryId: randomUUID(),
      subsectorId: subsector.subsectorId,
      subcategoryName: `${PREFIX} land remaining`,
      referenceNumber: GPC_REF,
      scopeId: scope.scopeId,
    });
    subcategoryId = subcategory.subcategoryId;
  });

  afterAll(async () => {
    if (jobIds.length) {
      await db.models.BulkInventoryImportJob.destroy({
        where: { id: jobIds },
      });
    }
    if (createdCityIds.length) {
      await db.models.CityUser.destroy({
        where: { cityId: createdCityIds },
      });
      const inventories = await db.models.Inventory.findAll({
        where: { cityId: createdCityIds },
      });
      const inventoryIds = inventories.map((inv) => inv.inventoryId);
      if (inventoryIds.length) {
        await db.models.ImportedInventoryFile.destroy({
          where: { inventoryId: inventoryIds },
        });
        const values = await db.models.InventoryValue.findAll({
          where: { inventoryId: inventoryIds },
        });
        const valueIds = values.map((value) => value.id);
        if (valueIds.length) {
          const activities = await db.models.ActivityValue.findAll({
            where: { inventoryValueId: valueIds },
          });
          const activityIds = activities.map((activity) => activity.id);
          if (activityIds.length) {
            await db.models.GasValue.destroy({
              where: { activityValueId: activityIds },
            });
          }
          await db.models.GasValue.destroy({
            where: { inventoryValueId: valueIds },
          });
          await db.models.ActivityValue.destroy({
            where: { inventoryValueId: valueIds },
          });
          await db.models.InventoryValue.destroy({
            where: { inventoryId: inventoryIds },
          });
        }
        await db.models.Inventory.destroy({
          where: { inventoryId: inventoryIds },
        });
      }
      await db.models.City.destroy({ where: { cityId: createdCityIds } });
    }
    if (subcategoryId) {
      await db.models.SubCategory.destroy({
        where: { subcategoryId },
      });
    }
    if (subsectorId) {
      await db.models.SubSector.destroy({ where: { subsectorId } });
    }
    if (sectorId) {
      await db.models.Sector.destroy({ where: { sectorId } });
    }
    if (createdScopeId) {
      await db.models.Scope.destroy({ where: { scopeId: createdScopeId } });
    }
    jest.restoreAllMocks();
    if (db.sequelize) await db.sequelize.close();
  });

  it("leaves unmatched files unmatched when createMissingCities is false", async () => {
    const zip = await createBulkInventoryImportZip({
      [`XX-${locodeToken}-2023.csv`]: ecrfCsv(1),
    });
    const result = await BulkInventoryImportEnqueueService.enqueue({
      projectId: DEFAULT_PROJECT_ID,
      year: 2023,
      zipBuffer: zip,
      zipFileName: "imp007-no-create.zip",
      userId: testUserID,
      createMissingCities: false,
    });
    jobIds.push(result.jobId);
    expect(result.unmatchedCount).toBe(1);

    const cities = await db.models.City.findAll({
      where: { locode },
    });
    expect(cities).toHaveLength(0);
  });

  it("creates a city + inventory for a new locode, imports, and does not duplicate on a second run", async () => {
    const zip = await createBulkInventoryImportZip({
      [`XX-${locodeToken}-2023.csv`]: ecrfCsv(-239.5),
    });

    const first = await BulkInventoryImportEnqueueService.enqueue({
      projectId: DEFAULT_PROJECT_ID,
      year: 2023,
      zipBuffer: zip,
      zipFileName: "imp007-create.zip",
      userId: testUserID,
      createMissingCities: true,
      inventoryType: InventoryTypeEnum.GPC_BASIC,
      gwp: GlobalWarmingPotentialTypeEnum.ar6,
    });
    jobIds.push(first.jobId);
    expect(first.unmatchedCount).toBe(0);
    expect(first.itemCount).toBe(1);

    const items = await db.models.BulkInventoryImportItem.findAll({
      where: { jobId: first.jobId },
    });
    expect(items).toHaveLength(1);
    expect(items[0].status).toBe(BulkInventoryImportItemStatus.PENDING);
    expect(items[0].cityId).toBeTruthy();
    expect(items[0].inventoryId).toBeTruthy();
    expect(items[0].locode).toBe(locode);
    expect(items[0].warnings).toEqual(
      expect.arrayContaining(["created_city", "created_inventory"]),
    );
    createdCityIds.push(items[0].cityId!);

    const cityUser = await db.models.CityUser.findOne({
      where: { cityId: items[0].cityId!, userId: testUserID },
    });
    expect(cityUser).not.toBeNull();

    const processed = await BulkInventoryImportWorkerService.processDueJobs(10);
    expect(processed.itemsProcessed).toBeGreaterThanOrEqual(1);

    const importedItem = await db.models.BulkInventoryImportItem.findByPk(
      items[0].id,
    );
    expect(importedItem?.status).toBe("completed");

    const inventoryValue = await db.models.InventoryValue.findOne({
      where: {
        inventoryId: items[0].inventoryId!,
        gpcReferenceNumber: GPC_REF,
      },
    });
    expect(inventoryValue).not.toBeNull();
    expect(BigInt(inventoryValue!.co2eq as unknown as string)).toBe(-239500n);

    const activity = await db.models.ActivityValue.findOne({
      where: { inventoryValueId: inventoryValue!.id },
    });
    expect(activity).not.toBeNull();
    expect(BigInt(activity!.co2eq as unknown as string)).toBe(-239500n);

    const second = await BulkInventoryImportEnqueueService.enqueue({
      projectId: DEFAULT_PROJECT_ID,
      year: 2023,
      zipBuffer: zip,
      zipFileName: "imp007-create-again.zip",
      userId: testUserID,
      createMissingCities: true,
    });
    jobIds.push(second.jobId);

    const cities = await db.models.City.findAll({ where: { locode } });
    expect(cities).toHaveLength(1);
    expect(cities[0].cityId).toBe(items[0].cityId);

    const secondItems = await db.models.BulkInventoryImportItem.findAll({
      where: { jobId: second.jobId },
    });
    expect(secondItems[0].cityId).toBe(items[0].cityId);
    expect(secondItems[0].status).toBe(BulkInventoryImportItemStatus.PENDING);
    expect(secondItems[0].warnings ?? []).not.toContain("created_city");
  });

  it("creates a name-only CRFFormat city when no locode exists", async () => {
    const zip = await createBulkInventoryImportZip({
      [`${nameOnlyCity}_CRFFormat_2023_20260917.csv`]: ecrfCsv(10),
    });
    const result = await BulkInventoryImportEnqueueService.enqueue({
      projectId: DEFAULT_PROJECT_ID,
      year: 2023,
      zipBuffer: zip,
      zipFileName: "imp007-name.zip",
      userId: testUserID,
      createMissingCities: true,
    });
    jobIds.push(result.jobId);
    expect(result.unmatchedCount).toBe(0);

    const item = await db.models.BulkInventoryImportItem.findOne({
      where: { jobId: result.jobId },
    });
    expect(item?.cityId).toBeTruthy();
    createdCityIds.push(item!.cityId!);

    const city = await db.models.City.findByPk(item!.cityId!);
    expect(city?.name).toBe(nameOnlyCity);
    expect(city?.locode == null || city?.locode === "").toBe(true);
  });
});
