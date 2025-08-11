import { db } from "@/models";
import { randomUUID } from "node:crypto";
import { GET as getResults } from "@/app/api/v0/inventory/[inventory]/results/route";
import { afterAll, beforeAll, describe, expect, it } from "@jest/globals";
import {
  expectStatusCode,
  mockRequest,
  setupTests,
  testUserID,
} from "../helpers";
import { createTestData, cleanupTestData, TestData } from "../helpers/testDataCreationHelper";

import { Inventory } from "@/models/Inventory";
import {
  activityValues as activityValuesData,
  baseInventory,
  inventoryId,
  inventoryValueId,
  inventoryValueId1,
  inventoryValueId2,
  inventoryValues as inventoryValuesData,
} from "./results.data";
import { Op } from "sequelize";
import { City } from "@/models/City";
import {
  GlobalWarmingPotentialTypeEnum,
  InventoryTypeEnum,
} from "@/util/enums";

const locode = "XX_SUBCATEGORY_CITY";

describe("Results API", () => {
  let inventory: Inventory;
  let city: City;
  let testData: TestData;

  beforeAll(async () => {
    setupTests();
    await db.initialize();

    // Create proper test data hierarchy
    testData = await createTestData({
      cityName: locode,
      countryLocode: "XX"
    });

    // Get the created city
    city = await db.models.City.findByPk(testData.cityId) as City;
    if (!city) {
      throw new Error(`Failed to find city with ID ${testData.cityId}`);
    }

    await db.models.User.upsert({ userId: testUserID, name: "TEST_USER" });
    await city.addUser(testUserID);

    inventory = await db.models.Inventory.create({
      inventoryId,
      ...baseInventory,
      inventoryName: "ReportResultInventory",
      cityId: city.cityId,
      inventoryType: InventoryTypeEnum.GPC_BASIC,
      globalWarmingPotentialType: GlobalWarmingPotentialTypeEnum.ar6,
    });

    await db.models.InventoryValue.bulkCreate(inventoryValuesData);
    await db.models.ActivityValue.bulkCreate(activityValuesData);
  });

  afterAll(async () => {
    await db.models.ActivityValue.destroy({
      where: {
        inventoryValueId: {
          [Op.in]: [inventoryValueId, inventoryValueId1, inventoryValueId2],
        },
      },
    });
    await db.models.InventoryValue.destroy({ where: { inventoryId } });
    await db.models.Inventory.destroy({ where: { inventoryId } });
    // Clean up any other inventories created during tests
    await db.models.Inventory.destroy({
      where: {
        inventoryName: "ReportResultEmptyInventory",
      },
    });
    await cleanupTestData(testData);
    if (db.sequelize) await db.sequelize.close();
  });

  it("should return emissions data for a valid inventory", async () => {
    const req = mockRequest();
    const res = await getResults(req, {
      params: Promise.resolve({ inventory: inventory.inventoryId }),
    });

    await expectStatusCode(res, 200);
    expect(await res.json()).toEqual({
      data: {
        topEmissions: {
          bySubSector: [
            {
              co2eq: "40399",
              inventoryId,
              percentage: 48,
              scopeName: "1",
              sectorName: "Stationary Energy",
              subsectorName: "Residential buildings",
            },
            {
              co2eq: "22388",
              inventoryId,
              percentage: 27,
              scopeName: "1",
              sectorName: "Transportation",
              subsectorName: "On-road transportation",
            },
            {
              co2eq: "10582",
              inventoryId,
              percentage: 13,
              scopeName: "1",
              sectorName: "Agriculture, Forestry, and Other Land Use (AFOLU)",
              subsectorName: "Emissions from land within the city boundary",
            },
            {
              co2eq: "10581",
              inventoryId,
              percentage: 13,
              scopeName: "1",
              sectorName: "Agriculture, Forestry, and Other Land Use (AFOLU)",
              subsectorName:
                "Emissions from livestock within the city boundary",
            },
          ],
        },
        totalEmissions: {
          bySector: [
            {
              co2eq: "40399",
              percentage: 48,
              sectorName: "stationary-energy",
            },
            {
              co2eq: "22388",
              percentage: 27,
              sectorName: "transportation",
            },
            {
              co2eq: "21163",
              percentage: 25,
              sectorName: "afolu",
            },
          ],
          total: "83950",
        },
      },
    });
  });

  it("should return empty arrays when Inventory has no data", async () => {
    const emptyInventoryId = randomUUID();

    // Ensure the city exists before creating the inventory
    const cityExists = await db.models.City.findByPk(city.cityId);
    if (!cityExists) {
      throw new Error(`City with ID ${city.cityId} does not exist`);
    }

    let emptyInventory;
    try {
      emptyInventory = await db.models.Inventory.create({
        inventoryId: emptyInventoryId,
        ...baseInventory,
        inventoryName: "ReportResultEmptyInventory",
        cityId: city.cityId,
        inventoryType: InventoryTypeEnum.GPC_BASIC,
        globalWarmingPotentialType: GlobalWarmingPotentialTypeEnum.ar6,
        year: 2022,
      });
    } catch (error) {
      console.error("Failed to create inventory:", error);
      console.error("City ID:", city.cityId);
      console.error("City exists:", await db.models.City.findByPk(city.cityId));
      throw error;
    }
    const req = mockRequest();
    const res = await getResults(req, {
      params: Promise.resolve({ inventory: emptyInventory.inventoryId }),
    });

    await expectStatusCode(res, 200);
    expect(await res.json()).toEqual({
      data: {
        topEmissions: {
          bySubSector: [],
        },
        totalEmissions: {
          bySector: [],
          total: 0,
        },
      },
    });
  });
});
