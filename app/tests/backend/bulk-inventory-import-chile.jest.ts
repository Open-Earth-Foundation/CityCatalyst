/**
 * Chile MEED zip: match on INE, skip OpenClimate city actors, fill population
 * from Global API.
 */
import { afterAll, beforeAll, describe, expect, it, jest } from "@jest/globals";
import env from "@next/env";
import { db } from "@/models";
import { Roles } from "@/util/types";
import { BulkInventoryImportItemStatus } from "@/util/enums";
import { DEFAULT_PROJECT_ID } from "@/util/constants";
import { BulkInventoryImportEnqueueService } from "@/backend/BulkInventoryImportEnqueueService";
import { createBulkInventoryImportZip } from "@/backend/BulkInventoryImportZip";
import OpenClimateService from "@/backend/OpenClimateService";
import CityBoundaryService from "@/backend/CityBoundaryService";
import { MeedGlobalApiService } from "@/backend/meed/MeedGlobalApiService";

const testUserID = "beb9634a-b68c-4c1b-a20b-2ab0ced5e3c2";

function chileCsv(): string {
  return [
    "GPC Reference Number,Total Emissions",
    "I.1.1,10",
    "",
  ].join("\n");
}

describe("Bulk inventory import Chile INE cities", () => {
  const createdCityIds: string[] = [];
  const jobIds: string[] = [];

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
    jest
      .spyOn(OpenClimateService, "getCityName")
      .mockResolvedValue(null as never);
    jest
      .spyOn(OpenClimateService, "getPopulationData")
      .mockResolvedValue({ error: "should-not-run" } as never);
    jest.spyOn(OpenClimateService, "getActorPopulation").mockResolvedValue({
      population: 19600000,
      year: 2022,
      name: "Chile",
    } as never);
    jest.spyOn(MeedGlobalApiService, "fetchPopulationHistory").mockResolvedValue({
      population: [{ year: 2022, population: 189335 }],
    } as never);
    jest
      .spyOn(MeedGlobalApiService, "fetchCityAttributes")
      .mockResolvedValue(null as never);
    jest
      .spyOn(CityBoundaryService, "getCityBoundary")
      .mockRejectedValue(new Error("skip") as never);
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

  it("creates La Pintana from INE without calling OpenClimate city search", async () => {
    const zip = await createBulkInventoryImportZip({
      "inventory-CHL-13112-Wrong-Name-2022.csv": chileCsv(),
    });
    const result = await BulkInventoryImportEnqueueService.enqueue({
      projectId: DEFAULT_PROJECT_ID,
      year: 2022,
      zipBuffer: zip,
      zipFileName: "chile-pintana.zip",
      userId: testUserID,
      createMissingCities: true,
      countryLocode: "CL",
    });
    jobIds.push(result.jobId);
    expect(result.unmatchedCount).toBe(0);
    expect(OpenClimateService.searchCities).not.toHaveBeenCalled();
    expect(OpenClimateService.getPopulationData).not.toHaveBeenCalled();

    const item = await db.models.BulkInventoryImportItem.findOne({
      where: { jobId: result.jobId },
    });
    expect(item?.status).toBe(BulkInventoryImportItemStatus.PENDING);
    expect(item?.locode).toBe("CL13112");
    expect(item?.cityId).toBeTruthy();
    createdCityIds.push(item!.cityId!);

    const city = await db.models.City.findByPk(item!.cityId!);
    expect(city?.name).toBe("La Pintana");
    expect(city?.locode).toBe("CL13112");
    expect(city?.countryLocode).toBe("CL");
    expect(city?.country).toBe("Chile");

    const population = await db.models.Population.findOne({
      where: { cityId: item!.cityId!, year: 2022 },
    });
    expect(Number(population?.population)).toBe(189335);
    expect(Number(population?.countryPopulation)).toBe(19600000);
  });

  it("leaves Chile INE files unmatched when createMissingCities is off", async () => {
    const zip = await createBulkInventoryImportZip({
      "inventory-CHL-13114-Las-Condes-2022.csv": chileCsv(),
    });
    const result = await BulkInventoryImportEnqueueService.enqueue({
      projectId: DEFAULT_PROJECT_ID,
      year: 2022,
      zipBuffer: zip,
      zipFileName: "chile-unmatched.zip",
      userId: testUserID,
      createMissingCities: false,
    });
    jobIds.push(result.jobId);
    expect(result.unmatchedCount).toBe(1);
    expect(OpenClimateService.searchCities).not.toHaveBeenCalled();

    const item = await db.models.BulkInventoryImportItem.findOne({
      where: { jobId: result.jobId },
    });
    expect(item?.status).toBe(BulkInventoryImportItemStatus.UNMATCHED);
    expect(item?.locode).toBe("CL13114");
  });
});
