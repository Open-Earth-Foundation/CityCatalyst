import { db } from "@/models";
import { randomUUID } from "node:crypto";
import { GET as getBreakdown } from "@/app/api/v0/inventory/[inventory]/results/[sectorName]/route";

import { afterAll, beforeAll, describe, expect, it } from "@jest/globals";
import {
  expectStatusCode,
  mockRequest,
  setupTests,
  testUserID,
} from "../helpers";

import { Inventory } from "@/models/Inventory";
import {
  activityValues as activityValuesData,
  baseInventory,
  inventoryId,
  inventoryValueId1,
  inventoryValueId2,
  inventoryValueId3,
  inventoryValues as inventoryValuesData,
} from "./results_sector.data";
import { Op } from "sequelize";
import { City } from "@/models/City";
import {
  GlobalWarmingPotentialTypeEnum,
  InventoryTypeEnum,
} from "@/util/enums";

const locode = "XX_SUBCATEGORY_CITY";

// TODO [ON-2579] fix tests
describe.skip("Results API", () => {
  let inventory: Inventory;
  let city: City;

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
          [Op.in]: [inventoryValueId3, inventoryValueId1, inventoryValueId2],
        },
      },
    });
    await db.models.InventoryValue.destroy({ where: { inventoryId } });
    await db.models.Inventory.destroy({ where: { inventoryId } });
    await db.models.City.destroy({ where: { cityId: city.cityId } });
    if (db.sequelize) await db.sequelize.close();
  });

  it("should return correct results for a sector", async () => {
    const req = mockRequest();
    const res = await getBreakdown(req, {
      params: {
        inventory: inventory.inventoryId,
        sectorName: "Stationary Energy",
      },
    });

    await expectStatusCode(res, 200);
    expect(await res.json()).toEqual({
      data: {
        byActivity: {
          "commercial-and-institutional-buildings-and-facilities": {
            "fuel-type-natural-gas": {
              "units-gallons": {
                activityUnits: "units-gallons",
                activityValue: "200000200",
                totalActivityEmissions: "700",
                totalEmissionsPercentage: 100,
              },
            },
            totals: {
              totalActivityEmissions: "700",
              totalActivityValueByUnit: {
                "units-gallons": "200000200",
              },
            },
          },
          "residential-buildings": {
            "fuel-type-gasoline": {
              "N/A": {
                activityUnits: "N/A",
                activityValue: "N/A",
                totalActivityEmissions: "300",
                totalEmissionsPercentage: 100,
              },
            },
            totals: {
              totalActivityEmissions: "300",
              totalActivityValueByUnit: {
                "N/A": "N/A",
              },
            },
          },
        },
        byScope: [
          {
            activityTitle: "fuel-type-natural-gas",
            percentage: 70,
            scopes: {
              "1": "700",
            },
            totalEmissions: "700",
          },
          {
            activityTitle: "fuel-type-gasoline",
            percentage: 30,
            scopes: {
              "1": "300",
            },
            totalEmissions: "300",
          },
        ],
      },
    });
  });
});
