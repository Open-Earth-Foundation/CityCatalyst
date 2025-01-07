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
import {
  GlobalWarmingPotentialTypeEnum,
  InventoryTypeEnum,
} from "@/util/enums";
import { City } from "@/models/City";
import { Inventory } from "@/models/Inventory";

const locode = "XX_SUBCATEGORY_CITY";

// TODO UNSKIP when we can mock getGrowthRatesFromOC
describe.skip("Emissions Forecast API", () => {
  let city: City;
  let inventory: Inventory;
  beforeAll(async () => {
    setupTests();
    await db.initialize();
    city = await db.models.City.create({
      cityId: randomUUID(),
      locode,
    });
    await db.models.User.upsert({ userId: testUserID, name: "TEST_USER" });
    await city.addUser(testUserID);
    inventory = await db.models.Inventory.create({
      inventoryId: inventoryId,
      ...baseInventory,
      inventoryName: "EmissionsForecastInventory",
      cityId: city.cityId,
      inventoryType: InventoryTypeEnum.GPC_BASIC,
      globalWarmingPotentialType: GlobalWarmingPotentialTypeEnum.ar6,
    });

    await db.models.InventoryValue.bulkCreate(inventoryValuesData);
  });

  afterAll(async () => {
    await db.models.InventoryValue.destroy({ where: { inventoryId } });
    await db.models.Inventory.destroy({ where: { inventoryId } });
    await db.models.City.destroy({ where: { cityId: city.cityId } });
    if (db.sequelize) await db.sequelize.close();
  });

  it("should calculate projected emissions correctly", async () => {
    jest.mock("@/backend/OpenClimateService", () => {
      return {
        getGrowthRatesFromOC: jest
          .fn()
          .mockImplementation(() => growth_rates_response),
      };
    });
    const req = mockRequest();
    const result = await getResults(req, {
      params: { inventory: inventory.inventoryId },
    });

    expect(await result.json()).toMatchSnapshot();
  });

  it("should handle empty growth factors", async () => {
    jest.mock("@/backend/OpenClimateService", () => {
      return {
        getGrowthRatesFromOC: jest.fn().mockImplementation(() => undefined),
      };
    });
    const req = mockRequest();
    const result = await getResults(req, {
      params: { inventory: inventory.inventoryId },
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
