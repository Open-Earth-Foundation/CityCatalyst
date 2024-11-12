import {
  DELETE as deleteInventoryValue,
  GET as findInventoryValue,
  PATCH as upsertInventoryValue,
} from "@/app/api/v0/inventory/[inventory]/value/[subcategory]/route";
import { GET as batchFindInventoryValues } from "@/app/api/v0/inventory/[inventory]/value/route";

import { db } from "@/models";
import { CreateInventoryValueRequest } from "@/util/validation";
import assert from "node:assert";
import { randomUUID } from "node:crypto";
import { after, before, beforeEach, describe, it } from "node:test";

import { mockRequest, setupTests, testUserID } from "../helpers";

import { Inventory } from "@/models/Inventory";
import { InventoryValue } from "@/models/InventoryValue";
import { SubCategory } from "@/models/SubCategory";
import { SubSector } from "@/models/SubSector";
import {
  GlobalWarmingPotentialTypeEnum,
  InventoryTypeEnum,
} from "@/util/enums";

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

  before(async () => {
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
      inventoryType: InventoryTypeEnum.GPC_BASIC,
      globalWarmingPotentialType: GlobalWarmingPotentialTypeEnum.ar6,
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

  after(async () => {
    if (db.sequelize) await db.sequelize.close();
  });

  it("should not create an inventory value with invalid data", async () => {
    const req = mockRequest(invalidInventoryValue);
    const res = await upsertInventoryValue(req, {
      params: {
        inventory: inventory.inventoryId,
        subcategory: subCategory.subcategoryId,
      },
    });
    assert.equal(res.status, 400);
    const {
      error: { issues },
    } = await res.json();
    assert.equal(issues.length, 3);
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

    assert.equal(res.status, 200);
    assert.equal(data.co2eq, co2eq);
    assert.equal(data.activityUnits, activityUnits);
    assert.equal(data.activityValue, activityValue);
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

    assert.equal(res.status, 200);
    assert.equal(data.length, 2);

    // database returns results in random order
    data.sort((a: InventoryValue, b: InventoryValue) => {
      if (a?.created && b?.created) {
        return new Date(a.created).getTime() - new Date(b.created).getTime();
      } else {
        return 0;
      }
    });

    assert.equal(data[0].co2eq, co2eq);
    assert.equal(data[1].co2eq, inventoryValue2.co2eq);
    assert.equal(data[0].activityUnits, activityUnits);
    assert.equal(data[1].activityUnits, inventoryValue2.activityUnits);
    assert.equal(data[0].activityValue, activityValue);
    assert.equal(data[1].activityValue, inventoryValue2.activityValue);
  });

  it("should update an inventory value", async () => {
    const req = mockRequest(inventoryValue1);
    const res = await upsertInventoryValue(req, {
      params: {
        inventory: inventory.inventoryId,
        subcategory: subCategory.subcategoryId,
      },
    });
    const { data } = await res.json();
    assert.equal(res.status, 200);
    assert.equal(data.co2eq, inventoryValue1.co2eq);
    assert.equal(data.activityUnits, inventoryValue1.activityUnits);
    assert.equal(data.activityValue, inventoryValue1.activityValue);
  });

  it("should not update an inventory value with invalid data", async () => {
    const req = mockRequest(invalidInventoryValue);
    const res = await upsertInventoryValue(req, {
      params: {
        inventory: inventory.inventoryId,
        subcategory: subCategory.subcategoryId,
      },
    });
    assert.equal(res.status, 400);
    const {
      error: { issues },
    } = await res.json();
    assert.equal(issues.length, 3);
  });

  it("should delete an inventory value", async () => {
    const req = mockRequest(inventoryValue2);
    const res = await deleteInventoryValue(req, {
      params: {
        inventory: inventory.inventoryId,
        subcategory: subCategory.subcategoryId,
      },
    });
    assert.equal(res.status, 200);
    const { data, deleted } = await res.json();
    assert.equal(deleted, true);
    assert.equal(data.co2eq, co2eq);
    assert.equal(data.activityUnits, activityUnits);
    assert.equal(data.activityValue, activityValue);
  });
});
