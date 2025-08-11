import { afterAll, beforeAll, describe, expect, it, jest } from "@jest/globals";
import {
  baseInventory,
  growth_rates_response,
  inventoryId,
  inventoryValues as inventoryValuesData,
} from "./results.data";
import { GET as getResults } from "@/app/api/v0/inventory/[inventory]/results/emissions-forecast/route";
import { db } from "@/models";
import { randomUUID } from "node:crypto";
import { mockRequest, setupTests, testUserID } from "../helpers";
import { createTestData, cleanupTestData, TestData } from "../helpers/testDataCreationHelper";
import {
  GlobalWarmingPotentialTypeEnum,
  InventoryTypeEnum,
} from "@/util/enums";
import { City } from "@/models/City";
import { Inventory } from "@/models/Inventory";
import { GrowthRatesResponse } from "@/backend/GlobalAPIService";
import GlobalAPIService from "@/backend/GlobalAPIService";

const locode = "XX_SUBCATEGORY_CITY";

describe("Emissions Forecast API", () => {
  let city: City;
  let inventory: Inventory;
  let mockGrowthRates: GrowthRatesResponse | undefined;
  let testData: TestData;

  jest
    .spyOn(GlobalAPIService, "fetchGrowthRates")
    .mockImplementation((locode, forecastYear) => {
      return Promise.resolve(mockGrowthRates);
    });

  beforeAll(async () => {
    setupTests();
    await db.initialize();
    
    // Create proper test data hierarchy
    testData = await createTestData({
      cityName: locode,
      countryLocode: "XX"
    });

    city = await db.models.City.findByPk(testData.cityId);
    if (!city) {
      throw new Error(`Failed to find city with ID ${testData.cityId}`);
    }
    
    await db.models.User.upsert({ userId: testUserID, name: "TEST_USER" });
    await city.addUser(testUserID);
    inventory = await db.models.Inventory.create({
      inventoryId: inventoryId,
      ...baseInventory,
      inventoryName: "EmissionsForecastInventory",
      cityId: city.cityId,
      inventoryType: InventoryTypeEnum.GPC_BASIC,
      globalWarmingPotentialType: GlobalWarmingPotentialTypeEnum.ar6,
      year: 2023,
    });

    await db.models.InventoryValue.bulkCreate(inventoryValuesData);
  });

  afterAll(async () => {
    await db.models.InventoryValue.destroy({ where: { inventoryId } });
    await db.models.Inventory.destroy({ where: { inventoryId } });
    await cleanupTestData(testData);
    if (db.sequelize) await db.sequelize.close();
  });

  it("should calculate projected emissions correctly", async () => {
    mockGrowthRates = growth_rates_response;
    const req = mockRequest();
    const result = await getResults(req, {
      params: Promise.resolve({ inventory: inventory.inventoryId }),
    });

    expect(await result.json()).toMatchSnapshot();
  });

  it("should handle empty growth factors", async () => {
    mockGrowthRates = undefined;
    const req = mockRequest();
    const result = await getResults(req, {
      params: Promise.resolve({ inventory: inventory.inventoryId }),
    });

    expect(await result.json()).toEqual({
      data: {
        cluster: null,
        forecast: null,
        growthRates: null,
      },
    });
  });
});
