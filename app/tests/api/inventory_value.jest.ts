import {
  GET as findInventoryValue,
  PATCH as upsertInventoryValue,
} from "@/app/api/v0/inventory/[inventory]/value/[subcategory]/route";
import { GET as batchFindInventoryValues } from "@/app/api/v0/inventory/[inventory]/value/route";

import { db } from "@/models";
import { CreateInventoryValueRequest } from "@/util/validation";
import { randomUUID } from "node:crypto";
import {
  describe,
  expect,
  beforeAll,
  beforeEach,
  afterAll,
  it,
} from "@jest/globals";

import {
  expectStatusCode,
  expectToBeLooselyEqual,
  mockRequest,
  setupTests,
  testUserID,
} from "../helpers";

import { Inventory } from "@/models/Inventory";
import { InventoryValue } from "@/models/InventoryValue";
import { SubCategory } from "@/models/SubCategory";
import { SubSector } from "@/models/SubSector";

const locode = "XX_SUBCATEGORY_CITY";
const co2eq = 44000n;
const activityUnits = "UNITS";
const activityValue = 1000;
const inventoryName = "TEST_SUBCATEGORY_INVENTORY";
const subcategoryName = "TEST_SUBCATEGORY_SUBCATEGORY";
const subsectorName = "TEST_SUBCATEGORY_SUBSECTOR";

const baseInventory = {
  cityPopulation: 0,
  regionPopulation: 0,
  countryPopulation: 0,
  cityPopulationYear: 0,
  regionPopulationYear: 0,
  countryPopulationYear: 0,
};
const inventoryValue1: CreateInventoryValueRequest = {
  ...baseInventory,
  activityUnits,
  activityValue,
  co2eq,
};

const inventoryValue2: CreateInventoryValueRequest = {
  ...baseInventory,
  activityUnits,
  activityValue,
  co2eq: 700000n,
};

const invalidInventoryValue = {
  ...baseInventory,
  activityUnits: activityUnits,
  activityValue: 1000000,
  co2eq: -1n,
};

describe("Inventory Value API", () => {
  let inventory: Inventory;
  let subCategory: SubCategory;
  let subSector: SubSector;
  let inventoryValue: InventoryValue;

  beforeAll(async () => {
    setupTests();
    await db.initialize();

    await db.models.SubCategory.destroy({
      where: { subcategoryName },
    });
    await db.models.SubSector.destroy({
      where: { subsectorName },
    });
    await db.models.City.destroy({ where: { locode } });

    const prevInventory = await db.models.Inventory.findOne({
      where: { inventoryName },
    });
    if (prevInventory) {
      await db.models.InventoryValue.destroy({
        where: { inventoryId: prevInventory.inventoryId },
      });
      await db.models.Inventory.destroy({
        where: { inventoryName },
      });
    }

    const city = await db.models.City.create({
      cityId: randomUUID(),
      locode,
    });
    await db.models.User.upsert({ userId: testUserID, name: "TEST_USER" });
    await city.addUser(testUserID);
    inventory = await db.models.Inventory.create({
      inventoryId: randomUUID(),
      inventoryName: "TEST_SUBCATEGORY_INVENTORY",
      cityId: city.cityId,
    });

    subSector = await db.models.SubSector.create({
      subsectorId: randomUUID(),
      subsectorName,
    });

    subCategory = await db.models.SubCategory.create({
      subcategoryId: randomUUID(),
      subsectorId: subSector.subsectorId,
      subcategoryName,
    });
  });

  beforeEach(async () => {
    await db.models.InventoryValue.destroy({
      where: { inventoryId: inventory.inventoryId },
    });
    inventoryValue = await db.models.InventoryValue.create({
      inventoryId: inventory.inventoryId,
      id: randomUUID(),
      subCategoryId: subCategory.subcategoryId,
      co2eq,
      activityUnits,
      activityValue,
    });
  });

  afterAll(async () => {
    if (db.sequelize) await db.sequelize.close();
  });

  it("should create an inventory value", async () => {
    await db.models.InventoryValue.destroy({
      where: { id: inventoryValue.id },
    });
    const req = mockRequest(inventoryValue1);
    const res = await upsertInventoryValue(req, {
      params: {
        inventory: inventory.inventoryId,
        subcategory: subCategory.subcategoryId,
      },
    });
    await expectStatusCode(res, 200);
    const { data } = await res.json();

    expect(data.activityUnits).toEqual(inventoryValue1.activityUnits);
    expectToBeLooselyEqual(data.activityValue, inventoryValue1.activityValue);
    expectToBeLooselyEqual(data.co2eq, inventoryValue1.co2eq);
  });

  it.skip("should not create an inventory value with invalid data", async () => {
    const req = mockRequest(invalidInventoryValue);
    const res = await upsertInventoryValue(req, {
      params: {
        inventory: inventory.inventoryId,
        subcategory: subCategory.subcategoryId,
      },
    });
    await expectStatusCode(res, 400);
    const {
      error: { issues },
    } = await res.json();
    expect(issues.length).toEqual(3);
  });

  it("should find an inventory value", async () => {
    const req = mockRequest();
    const res = await findInventoryValue(req, {
      params: {
        inventory: inventory.inventoryId,
        subcategory: subCategory.subcategoryId,
      },
    });

    const { data } = await res.json();

    await expectStatusCode(res, 200);
    expectToBeLooselyEqual(data.co2eq, co2eq);
    expect(data.activityUnits).toEqual(activityUnits);
    expectToBeLooselyEqual(data.activityValue, activityValue);
  });

  it("should find multiple inventory values", async () => {
    // prepare data
    const subCategory2 = await db.models.SubCategory.create({
      subcategoryId: randomUUID(),
      subsectorId: subSector.subsectorId,
      subcategoryName: subcategoryName + "2",
    });
    await db.models.InventoryValue.create({
      inventoryId: inventory.inventoryId,
      id: randomUUID(),
      subCategoryId: subCategory2.subcategoryId,
      co2eq: inventoryValue2.co2eq,
      activityUnits: inventoryValue2.activityUnits,
      activityValue: inventoryValue2.activityValue,
    });

    const subCategoryIds = [
      subCategory.subcategoryId,
      subCategory2.subcategoryId,
    ].join(",");
    const req = mockRequest(null, { subCategoryIds });
    const res = await batchFindInventoryValues(req, {
      params: {
        inventory: inventory.inventoryId,
      },
    });

    const { data } = await res.json();

    await expectStatusCode(res, 200);
    expect(data.length).toEqual(2);

    // database returns results in random order
    data.sort((a: InventoryValue, b: InventoryValue) => {
      if (a?.created && b?.created) {
        return new Date(a.created).getTime() - new Date(b.created).getTime();
      } else {
        return 0;
      }
    });

    expectToBeLooselyEqual(data[0].co2eq, co2eq);
    expectToBeLooselyEqual(data[1].co2eq, inventoryValue2.co2eq);
    expect(data[0].activityUnits).toEqual(activityUnits);
    expect(data[1].activityUnits).toEqual(inventoryValue2.activityUnits);
    expectToBeLooselyEqual(data[0].activityValue, activityValue);
    expectToBeLooselyEqual(
      data[1].activityValue,
      inventoryValue2.activityValue,
    );
  });

  it("should not find a non-existing sub category", async () => {
    const req = mockRequest(invalidInventoryValue);
    const res = await findInventoryValue(req, {
      params: {
        inventory: inventory.inventoryId,
        subcategory: randomUUID(),
      },
    });
    await expectStatusCode(res, 404);
  });

  it.skip("should update an inventory value", async () => {
    const req = mockRequest(inventoryValue1);
    const res = await upsertInventoryValue(req, {
      params: {
        inventory: inventory.inventoryId,
        subcategory: subCategory.subcategoryId,
      },
    });
    await expectStatusCode(res, 200);
    const { data } = await res.json();
    expect(data.co2eq).toEqual(inventoryValue1.co2eq);
    expect(data.activityUnits).toEqual(inventoryValue1.activityUnits);
    expect(data.activityValue).toEqual(inventoryValue1.activityValue);
  });

  it.skip("should not update an inventory value with invalid data", async () => {
    const req = mockRequest(invalidInventoryValue);
    const res = await upsertInventoryValue(req, {
      params: {
        inventory: inventory.inventoryId,
        subcategory: subCategory.subcategoryId,
      },
    });
    await expectStatusCode(res, 400);
    const {
      error: { issues },
    } = await res.json();
    expect(issues.length).toEqual(3);
  });
});
