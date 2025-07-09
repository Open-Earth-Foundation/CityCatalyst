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

// TODO [ON-2579] fix tests - tests work locally but fail on CI
describe("Results API", () => {
  let inventory: Inventory;
  let city: City;

  beforeAll(async () => {
    setupTests();
    await db.initialize();

    const defaultProject = await db.models.Project.findOne({
      where: { name: "cc_project_default" },
    });

    city = await db.models.City.create({
      cityId: randomUUID(),
      locode,
      projectId: defaultProject!.projectId,
    });
    await db.models.User.upsert({ userId: testUserID, name: "TEST_USER" });
    await city.addUser(testUserID);

    // Clean up any existing test data before creating
    await db.models.ActivityValue.destroy({
      where: {
        inventoryValueId: {
          [Op.in]: [inventoryValueId3, inventoryValueId1, inventoryValueId2],
        },
      },
    });
    await db.models.InventoryValue.destroy({
      where: {
        inventoryId,
      },
    });

    inventory = await db.models.Inventory.create({
      inventoryId: inventoryId,
      ...baseInventory,
      inventoryName: "ReportResultInventory",
      cityId: city.cityId,
      inventoryType: InventoryTypeEnum.GPC_BASIC,
      globalWarmingPotentialType: GlobalWarmingPotentialTypeEnum.ar6,
    });

    // Replace bulkCreate with individual create calls and error logging
    for (const inventoryValueData of inventoryValuesData) {
      try {
        // If co2eq is a string, convert to BigInt for DB insertion
        const data = { ...inventoryValueData, co2eq: typeof inventoryValueData.co2eq === 'string' ? BigInt(inventoryValueData.co2eq) : inventoryValueData.co2eq };
        await db.models.InventoryValue.create(data);
      } catch (error) {
        console.error('Error creating InventoryValue:', error);
        console.error('Data:', inventoryValueData);
      }
    }
    for (const activityValueData of activityValuesData) {
      try {
        // If co2eq is a string, convert to BigInt for DB insertion
        const data = { ...activityValueData, co2eq: typeof activityValueData.co2eq === 'string' ? BigInt(activityValueData.co2eq) : activityValueData.co2eq };
        await db.models.ActivityValue.create(data);
      } catch (error) {
        console.error('Error creating ActivityValue:', error);
        console.error('Data:', activityValueData);
      }
    }
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
      params: Promise.resolve({
        inventory: inventory.inventoryId,
        sectorName: "stationary-energy",
      }),
    });

    await expectStatusCode(res, 200);

    const expected = {
      data: {
        byScope: [
          {
            activities: [
              {
                activity_data: null,
                activity_data_jsonb: {
                  "activity-total-fuel-consumption": "200000000",
                  "activity-total-fuel-consumption-unit": "units-gallons",
                  "commercial-building-fuel-type": "fuel-type-natural-gas",
                  "commercial-building-type": "type-institutional-buildings",
                  "data-source": "datasource",
                },
                co2eq: "200",
                co2eq_years: 100,
                created: expect.any(String),
                datasource_id: null,
                id: expect.any(String),
                inventory_value_id: inventoryValueId2,
                last_updated: expect.any(String),
                metadata: {
                  emissionFactorType: "6a508faa-80a8-3246-9941-90d8cc8dec85",
                },
              },
              {
                activity_data: null,
                activity_data_jsonb: {
                  "activity-total-fuel-consumption": "200",
                  "activity-total-fuel-consumption-unit": "units-gallons",
                  "commercial-building-fuel-type": "fuel-type-natural-gas",
                  "commercial-building-type": "type-commercial-institutional",
                  "data-source": "source",
                },
                co2eq: "500",
                co2eq_years: 100,
                created: expect.any(String),
                datasource_id: null,
                id: expect.any(String),
                inventory_value_id: inventoryValueId1,
                last_updated: expect.any(String),
                metadata: {
                  emissionFactorType: "6a508faa-80a8-3246-9941-90d8cc8dec85",
                },
              },
              {
                activity_data: null,
                activity_data_jsonb: {
                  "activity-total-fuel-consumption": "150",
                  "activity-total-fuel-consumption-unit": "units-kwh",
                  "commercial-building-fuel-type": "fuel-type-electricity",
                  "commercial-building-type": "type-commercial-institutional",
                  "data-source": "source2",
                },
                co2eq: "250",
                co2eq_years: 100,
                created: expect.any(String),
                datasource_id: null,
                id: expect.any(String),
                inventory_value_id: inventoryValueId1,
                last_updated: expect.any(String),
                metadata: {
                  emissionFactorType: "6a508faa-80a8-3246-9941-90d8cc8dec85",
                },
              },
            ],
            activityTitle:
              "Commercial and institutional buildings and facilities",
            datasource_id: null,
            datasource_name: null,
            percentage: 76, // 950/1250 ≈ 76%
            scopes: {
              "1": "950",
            },
            totalEmissions: "950",
          },
          {
            activities: [
              {
                activity_data: null,
                activity_data_jsonb: {
                  ch4_amount: 29,
                  co2_amount: 66,
                  n2o_amount: 19,
                  "residential-building-fuel-type": "fuel-type-gasoline",
                  "residential-building-type": "residential-building-type-all",
                  "residential-buildings-fuel-source": "Sit ad impedit par",
                },
                co2eq: "300",
                co2eq_years: 100,
                created: expect.any(String),
                datasource_id: "6bbbab3d-2978-4e7d-a2a7-295ecf35f338",
                id: expect.any(String),
                inventory_value_id: inventoryValueId3,
                last_updated: expect.any(String),
                metadata: { emissionFactorType: "" },
              },
            ],
            activityTitle: "Residential buildings",
            datasource_id: "814d43fd-42bf-49f9-a10f-2c5486cf0344",
            datasource_name: null,
            percentage: 24, // 300/1250 ≈ 24%
            scopes: {
              "1": "300",
            },
            totalEmissions: "300",
          },
        ],
      },
    };
    const result = await res.json();

    // Sort activities by co2eq to make the test order-independent
    if (result.data?.byScope?.[0]?.activities) {
      result.data.byScope[0].activities.sort((a: any, b: any) => 
        parseInt(a.co2eq) - parseInt(b.co2eq)
      );
    }
    if (expected.data?.byScope?.[0]?.activities) {
      expected.data.byScope[0].activities.sort((a: any, b: any) => 
        parseInt(a.co2eq) - parseInt(b.co2eq)
      );
    }
    
    expect(result).toEqual(expected);
  });
});
