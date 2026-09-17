/**
 * IMP-009: dry-run validates and matches without writing ActivityValue rows
 * or creating city/inventory shells.
 */
import { afterAll, beforeAll, describe, expect, it, jest } from "@jest/globals";
import { randomUUID } from "node:crypto";
import env from "@next/env";
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
import * as AIInterpretationService from "@/backend/AIInterpretationService";
import OpenClimateService from "@/backend/OpenClimateService";

const testUserID = "beb9634a-b68c-4c1b-a20b-2ab0ced5e3c2";
const PREFIX = `XX_IMP009_${randomUUID().slice(0, 8)}`;
const GPC_REF = `${PREFIX}.1.1`;

function ecrfCsv(totalCO2e: number): string {
  return [
    "GPC ref. no.,CRF - Sector,CRF - Sub-sector,Scope,GHGs (metric tonnes CO2e) - Total CO2e",
    `${GPC_REF},Stationary Energy,Residential Buildings,1,${totalCO2e}`,
    "",
  ].join("\n");
}

function longTidyCsv(): string {
  return "Year,Sector,GHG Emissions\n2023,Stationary Energy,100\n";
}

async function activityCountForInventories(
  inventoryIds: string[],
): Promise<number> {
  if (!inventoryIds.length) return 0;
  const values = await db.models.InventoryValue.findAll({
    where: { inventoryId: inventoryIds },
    attributes: ["id"],
  });
  if (!values.length) return 0;
  return db.models.ActivityValue.count({
    where: { inventoryValueId: values.map((value) => value.id) },
  });
}

describe("Bulk inventory import dry-run", () => {
  const createdCityIds: string[] = [];
  let jobId: string;
  let validInventoryId: string;
  let junkInventoryId: string;
  let sectorId: string;
  let subsectorId: string;
  let subcategoryId: string;
  let createdScopeId: string | null = null;

  beforeAll(async () => {
    env.loadEnvConfig(process.cwd());
    await db.initialize();
    await db.models.User.upsert({
      userId: testUserID,
      name: "Test User",
      email: "test@example.com",
      role: Roles.Admin,
    });

    jest.spyOn(OpenClimateService, "searchCities").mockResolvedValue([] as never);

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
    if (jobId) {
      await db.models.BulkInventoryImportJob.destroy({ where: { id: jobId } });
    }
    if (createdCityIds.length) {
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
      await db.models.CityUser.destroy({ where: { cityId: createdCityIds } });
      await db.models.City.destroy({ where: { cityId: createdCityIds } });
    }
    if (subcategoryId) {
      await db.models.SubCategory.destroy({ where: { subcategoryId } });
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

  it("validates a 3-file zip without writing activities or creating cities", async () => {
    const interpretSpy = jest.spyOn(
      AIInterpretationService,
      "interpretTabular",
    );

    const validName = `${PREFIX}_Valid`;
    const junkName = `${PREFIX}_Junk`;
    const ghostName = `${PREFIX}_Ghost`;

    const validCity = await db.models.City.create({
      cityId: randomUUID(),
      name: validName,
      projectId: DEFAULT_PROJECT_ID,
    });
    const junkCity = await db.models.City.create({
      cityId: randomUUID(),
      name: junkName,
      projectId: DEFAULT_PROJECT_ID,
    });
    createdCityIds.push(validCity.cityId, junkCity.cityId);

    const validInventory = await db.models.Inventory.create({
      inventoryId: randomUUID(),
      cityId: validCity.cityId,
      inventoryName: `${validName} 2023`,
      year: 2023,
      inventoryType: InventoryTypeEnum.GPC_BASIC,
      globalWarmingPotentialType: GlobalWarmingPotentialTypeEnum.ar6,
    });
    const junkInventory = await db.models.Inventory.create({
      inventoryId: randomUUID(),
      cityId: junkCity.cityId,
      inventoryName: `${junkName} 2023`,
      year: 2023,
      inventoryType: InventoryTypeEnum.GPC_BASIC,
      globalWarmingPotentialType: GlobalWarmingPotentialTypeEnum.ar6,
    });
    validInventoryId = validInventory.inventoryId;
    junkInventoryId = junkInventory.inventoryId;

    const beforeCount = await activityCountForInventories([
      validInventoryId,
      junkInventoryId,
    ]);

    const zip = await createBulkInventoryImportZip({
      [`${validName}_CRFFormat_2023_20260917.csv`]: ecrfCsv(-239.5),
      [`${junkName}_CRFFormat_2023_20260917.csv`]: longTidyCsv(),
      [`${ghostName}_CRFFormat_2023_20260917.csv`]: ecrfCsv(10),
    });

    const enqueued = await BulkInventoryImportEnqueueService.enqueue({
      projectId: DEFAULT_PROJECT_ID,
      year: 2023,
      zipBuffer: zip,
      zipFileName: "imp009.zip",
      userId: testUserID,
      dryRun: true,
      createMissingCities: true,
    });
    jobId = enqueued.jobId;
    expect(enqueued.itemCount).toBe(3);
    expect(enqueued.unmatchedCount).toBe(1);

    const ghostCities = await db.models.City.findAll({
      where: { name: ghostName, projectId: DEFAULT_PROJECT_ID },
    });
    expect(ghostCities).toHaveLength(0);

    await BulkInventoryImportWorkerService.processDueJobs(10, jobId);
    expect(interpretSpy).not.toHaveBeenCalled();
    interpretSpy.mockRestore();

    const items = await db.models.BulkInventoryImportItem.findAll({
      where: { jobId },
    });
    const byCity = new Map(items.map((item) => [item.cityId, item]));
    const unmatched = items.filter(
      (item) => item.status === BulkInventoryImportItemStatus.UNMATCHED,
    );

    const validItem = byCity.get(validCity.cityId);
    const junkItem = byCity.get(junkCity.cityId);
    expect(validItem?.status).toBe(BulkInventoryImportItemStatus.SKIPPED);
    expect(validItem?.errorCode).toBe("dry_run");
    expect(junkItem?.status).toBe(BulkInventoryImportItemStatus.FAILED);
    expect(junkItem?.errorCode).toBe("not_ecrf");
    expect(unmatched).toHaveLength(1);
    expect(unmatched[0].originalFileName).toMatch(/Ghost/);

    const afterCount = await activityCountForInventories([
      validInventoryId,
      junkInventoryId,
    ]);
    expect(afterCount).toBe(beforeCount);

    const importedFiles = await db.models.ImportedInventoryFile.count({
      where: { inventoryId: [validInventoryId, junkInventoryId] },
    });
    expect(importedFiles).toBe(0);

    const job = await db.models.BulkInventoryImportJob.findByPk(jobId);
    expect(job?.dryRun).toBe(true);
    expect(job?.status).toBe("completed");
  });
});
