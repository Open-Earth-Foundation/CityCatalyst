/**
 * IMP-006: worker auto-imports eCRF files (including negative CO2e) and fails
 * non-eCRF items with not_ecrf without calling OpenAI.
 */
import { afterAll, beforeAll, describe, expect, it, jest } from "@jest/globals";
import { randomUUID } from "node:crypto";
import env from "@next/env";
import { db } from "@/models";
import { Roles } from "@/util/types";
import {
  GlobalWarmingPotentialTypeEnum,
  InventoryTypeEnum,
} from "@/util/enums";
import { DEFAULT_PROJECT_ID } from "@/util/constants";
import { BulkInventoryImportEnqueueService } from "@/backend/BulkInventoryImportEnqueueService";
import { createBulkInventoryImportZip } from "@/backend/BulkInventoryImportZip";
import { BulkInventoryImportWorkerService } from "@/backend/BulkInventoryImportWorkerService";
import { getEmissionResults } from "@/backend/ResultsService";
import * as AIInterpretationService from "@/backend/AIInterpretationService";

const testUserID = "beb9634a-b68c-4c1b-a20b-2ab0ced5e3c2";
const PREFIX = `XX_IMP006_${randomUUID().slice(0, 8)}`;
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

describe("Bulk inventory import worker", () => {
  const createdCityIds: string[] = [];
  let jobId: string;
  let removalInventoryId: string;
  let positiveInventoryId: string;
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
    if (db.sequelize) await db.sequelize.close();
  });

  it("imports two eCRF files including a removal and fails a non-eCRF file without OpenAI", async () => {
    const interpretSpy = jest.spyOn(
      AIInterpretationService,
      "interpretTabular",
    );

    const removalName = `${PREFIX}_Removal`;
    const positiveName = `${PREFIX}_Positive`;
    const junkName = `${PREFIX}_Junk`;

    const removalCity = await db.models.City.create({
      cityId: randomUUID(),
      name: removalName,
      projectId: DEFAULT_PROJECT_ID,
    });
    const positiveCity = await db.models.City.create({
      cityId: randomUUID(),
      name: positiveName,
      projectId: DEFAULT_PROJECT_ID,
    });
    const junkCity = await db.models.City.create({
      cityId: randomUUID(),
      name: junkName,
      projectId: DEFAULT_PROJECT_ID,
    });
    createdCityIds.push(
      removalCity.cityId,
      positiveCity.cityId,
      junkCity.cityId,
    );

    const removalInventory = await db.models.Inventory.create({
      inventoryId: randomUUID(),
      cityId: removalCity.cityId,
      inventoryName: `${removalName} 2023`,
      year: 2023,
      inventoryType: InventoryTypeEnum.GPC_BASIC,
      globalWarmingPotentialType: GlobalWarmingPotentialTypeEnum.ar6,
    });
    const positiveInventory = await db.models.Inventory.create({
      inventoryId: randomUUID(),
      cityId: positiveCity.cityId,
      inventoryName: `${positiveName} 2023`,
      year: 2023,
      inventoryType: InventoryTypeEnum.GPC_BASIC,
      globalWarmingPotentialType: GlobalWarmingPotentialTypeEnum.ar6,
    });
    await db.models.Inventory.create({
      inventoryId: randomUUID(),
      cityId: junkCity.cityId,
      inventoryName: `${junkName} 2023`,
      year: 2023,
      inventoryType: InventoryTypeEnum.GPC_BASIC,
      globalWarmingPotentialType: GlobalWarmingPotentialTypeEnum.ar6,
    });
    removalInventoryId = removalInventory.inventoryId;
    positiveInventoryId = positiveInventory.inventoryId;

    const zip = await createBulkInventoryImportZip({
      [`${removalName}_CRFFormat_2023_20260917.csv`]: ecrfCsv(-239.5),
      [`${positiveName}_CRFFormat_2023_20260917.csv`]: ecrfCsv(10),
      [`${junkName}_CRFFormat_2023_20260917.csv`]: longTidyCsv(),
    });

    const enqueued = await BulkInventoryImportEnqueueService.enqueue({
      projectId: DEFAULT_PROJECT_ID,
      year: 2023,
      zipBuffer: zip,
      zipFileName: "imp006.zip",
      userId: testUserID,
    });
    jobId = enqueued.jobId;
    expect(enqueued.itemCount).toBe(3);
    expect(enqueued.unmatchedCount).toBe(0);

    const processed = await BulkInventoryImportWorkerService.processDueJobs(
      10,
      enqueued.jobId,
    );
    expect(processed.itemsProcessed).toBe(3);
    expect(interpretSpy).not.toHaveBeenCalled();
    interpretSpy.mockRestore();

    const items = await db.models.BulkInventoryImportItem.findAll({
      where: { jobId },
    });
    const byCity = new Map(items.map((item) => [item.cityId, item]));

    const removalItem = byCity.get(removalCity.cityId);
    const positiveItem = byCity.get(positiveCity.cityId);
    const junkItem = byCity.get(junkCity.cityId);
    expect(removalItem?.status).toBe("completed");
    expect(positiveItem?.status).toBe("completed");
    expect(junkItem?.status).toBe("failed");
    expect(junkItem?.errorCode).toBe("not_ecrf");
    expect(junkItem?.errorLog).toMatch(/not_ecrf/);

    const removalValue = await db.models.InventoryValue.findOne({
      where: {
        inventoryId: removalInventoryId,
        gpcReferenceNumber: GPC_REF,
      },
    });
    expect(removalValue).not.toBeNull();
    expect(BigInt(removalValue!.co2eq as unknown as string)).toBe(-239500n);

    const removalActivity = await db.models.ActivityValue.findOne({
      where: { inventoryValueId: removalValue!.id },
    });
    expect(removalActivity).not.toBeNull();
    expect(BigInt(removalActivity!.co2eq as unknown as string)).toBe(-239500n);

    const results = await getEmissionResults(removalInventoryId);
    expect(results.removals?.toNumber()).toBe(-239500);

    const positiveValue = await db.models.InventoryValue.findOne({
      where: {
        inventoryId: positiveInventoryId,
        gpcReferenceNumber: GPC_REF,
      },
    });
    expect(positiveValue).not.toBeNull();
    expect(BigInt(positiveValue!.co2eq as unknown as string)).toBe(10000n);

    const job = await db.models.BulkInventoryImportJob.findByPk(jobId);
    expect(job?.status).toBe("completed");
    expect(job?.importedCount).toBe(2);
    expect(job?.failedCount).toBe(1);
  });
});
