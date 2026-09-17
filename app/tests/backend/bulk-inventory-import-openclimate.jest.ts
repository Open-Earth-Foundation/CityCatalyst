/**
 * OpenClimate name search fallback + population nearest to the file year.
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
import OpenClimateService from "@/backend/OpenClimateService";
import CityBoundaryService from "@/backend/CityBoundaryService";
import { formatStoredLocode } from "@/backend/BulkInventoryImportMatcher";

const testUserID = "beb9634a-b68c-4c1b-a20b-2ab0ced5e3c2";
const PREFIX = `XX_OC_${randomUUID().slice(0, 8)}`;

function lettersFromUuid(count: number): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const hex = randomUUID().replace(/-/g, "");
  let out = "";
  for (let i = 0; i < count; i++) {
    out += alphabet[parseInt(hex[i * 2] ?? "0", 16) % alphabet.length];
  }
  return out;
}

function ecrfCsv(): string {
  return [
    "GPC ref. no.,CRF - Sector,CRF - Sub-sector,Scope,GHGs (metric tonnes CO2e) - Total CO2e",
    `${PREFIX}.1.1,Stationary Energy,Residential Buildings,1,10`,
    "",
  ].join("\n");
}

describe("Bulk inventory import OpenClimate matching", () => {
  const createdCityIds: string[] = [];
  const jobIds: string[] = [];
  const locodeToken = lettersFromUuid(3);
  const locode = formatStoredLocode(`BR-${locodeToken}`);
  const cityName = `${PREFIX}_Abadia`;

  beforeAll(async () => {
    loadEnvConfig(process.cwd());
    await db.initialize();
    await db.models.User.upsert({
      userId: testUserID,
      name: "Test User",
      email: "test@example.com",
      role: Roles.Admin,
    });

    jest.spyOn(OpenClimateService, "searchCities").mockResolvedValue([
      {
        actor_id: locode,
        name: cityName,
        type: "city",
      },
    ] as never);
    jest.spyOn(OpenClimateService, "getCityName").mockResolvedValue(cityName as never);
    jest.spyOn(OpenClimateService, "getPopulationData").mockResolvedValue({
      cityPopulation: 12345,
      cityPopulationYear: 2015,
      countryPopulation: 200000000,
      countryPopulationYear: 2015,
      regionPopulation: 7000000,
      regionPopulationYear: 2015,
      country: "Brazil",
      countryLocode: "BR",
    } as never);
    jest.spyOn(CityBoundaryService, "getCityBoundary").mockResolvedValue({
      data: null,
      boundingBox: [0, 0, 0, 0],
      area: 12,
    } as never);
  });

  afterAll(async () => {
    if (jobIds.length) {
      await db.models.BulkInventoryImportJob.destroy({
        where: { id: jobIds },
      });
    }
    if (createdCityIds.length) {
      await db.models.Population.destroy({
        where: { cityId: createdCityIds },
      });
      await db.models.CityUser.destroy({
        where: { cityId: createdCityIds },
      });
      const inventories = await db.models.Inventory.findAll({
        where: { cityId: createdCityIds },
      });
      const inventoryIds = inventories.map((inv) => inv.inventoryId);
      if (inventoryIds.length) {
        await db.models.Inventory.destroy({
          where: { inventoryId: inventoryIds },
        });
      }
      await db.models.City.destroy({ where: { cityId: createdCityIds } });
    }
    jest.restoreAllMocks();
    if (db.sequelize) await db.sequelize.close();
  });

  it("creates the city from a unique OpenClimate name match and stores nearest population", async () => {
    const zip = await createBulkInventoryImportZip({
      [`${cityName}_CRFFormat_2017_20260917.csv`]: ecrfCsv(),
    });
    const result = await BulkInventoryImportEnqueueService.enqueue({
      projectId: DEFAULT_PROJECT_ID,
      year: 2022,
      zipBuffer: zip,
      zipFileName: "oc-create.zip",
      userId: testUserID,
      createMissingCities: true,
      countryLocode: "BR",
      inventoryType: InventoryTypeEnum.GPC_BASIC,
      gwp: GlobalWarmingPotentialTypeEnum.ar6,
    });
    jobIds.push(result.jobId);
    expect(result.unmatchedCount).toBe(0);

    const item = await db.models.BulkInventoryImportItem.findOne({
      where: { jobId: result.jobId },
    });
    expect(item?.status).toBe(BulkInventoryImportItemStatus.PENDING);
    expect(item?.locode).toBe(locode);
    expect(item?.resolvedYear).toBe(2017);
    expect(item?.warnings).toEqual(
      expect.arrayContaining(["openclimate_match", "created_city"]),
    );
    createdCityIds.push(item!.cityId!);

    expect(OpenClimateService.getPopulationData).toHaveBeenCalledWith(
      locode,
      2017,
    );

    const population = await db.models.Population.findOne({
      where: { cityId: item!.cityId!, year: 2015 },
    });
    expect(Number(population?.population)).toBe(12345);

    const city = await db.models.City.findByPk(item!.cityId!);
    expect(city?.locode).toBe(locode);
    expect(city?.countryLocode).toBe("BR");
  });

  it("stays unmatched when OpenClimate matches but createMissingCities is off", async () => {
    const otherName = `${PREFIX}_Uncreated`;
    const otherLocode = formatStoredLocode(`BR-${lettersFromUuid(3)}`);
    jest.mocked(OpenClimateService.searchCities).mockResolvedValue([
      { actor_id: otherLocode, name: otherName, type: "city" },
    ]);

    const zip = await createBulkInventoryImportZip({
      [`${otherName}_CRFFormat_2017_20260917.csv`]: ecrfCsv(),
    });
    const result = await BulkInventoryImportEnqueueService.enqueue({
      projectId: DEFAULT_PROJECT_ID,
      year: 2022,
      zipBuffer: zip,
      zipFileName: "oc-no-create.zip",
      userId: testUserID,
      createMissingCities: false,
      countryLocode: "BR",
    });
    jobIds.push(result.jobId);
    expect(result.unmatchedCount).toBe(1);

    const item = await db.models.BulkInventoryImportItem.findOne({
      where: { jobId: result.jobId },
    });
    expect(item?.status).toBe(BulkInventoryImportItemStatus.UNMATCHED);
    expect(item?.locode).toBe(otherLocode);
    expect(item?.errorLog).toContain("Enable create missing cities");
  });
});
