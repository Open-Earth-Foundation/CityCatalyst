import {
  DELETE as deleteSubCategory,
  GET as findSubCategory,
  PATCH as upsertSubCategory,
} from "@/app/api/v0/inventory/[inventory]/subcategory/[subcategory]/route";

import { db } from "@/models";
import { CreateSubCategoryRequest } from "@/util/validation";
import assert from "node:assert";
import { randomUUID } from "node:crypto";
import { after, before, beforeEach, describe, it } from "node:test";

import { mockRequest, setupTests, testUserID } from "../helpers";

import { Inventory } from "@/models/Inventory";
import { InventoryValue } from "@/models/InventoryValue";
import { SubCategory } from "@/models/SubCategory";
import { SubSector } from "@/models/SubSector";

const locode = "XX_SUBCATEGORY_CITY";
const co2eq = BigInt(44000);
const activityUnits = "UNITS";
const activityValue = 1000;
const emissionFactorValue = 12;
const inventoryName = "TEST_SUBCATEGORY_INVENTORY";
const subcategoryName = "TEST_SUBCATEGORY_SUBCATEGORY";
const subsectorName = "TEST_SUBCATEGORY_SUBSECTOR";

const subcategoryValue1: CreateSubCategoryRequest = {
  activityUnits: "UNITS",
  activityValue: 1000,
  emissionFactorValue: 12,
  totalEmissions: 44000,
};

const subcategoryValue2: CreateSubCategoryRequest = {
  activityUnits: "UNITS",
  activityValue: 1000,
  emissionFactorValue: 12,
  totalEmissions: 700000,
};

const invalidSubCategoryValue = {
  activityUnits: 0,
  activityValue: "1000s",
  emissionFactorValue: "va",
  totalEmissions: "TOTAL_EMISSIONS",
};

describe("Sub Category API", () => {
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
      where: { id: inventory.inventoryId },
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

  it("Should create a sub category", async () => {
    await db.models.InventoryValue.destroy({
      where: { id: inventoryValue.id },
    });
    const req = mockRequest(subcategoryValue1);
    const res = await upsertSubCategory(req, {
      params: {
        inventory: inventory.inventoryId,
        subcategory: subCategory.subcategoryId,
      },
    });
    assert.equal(res.status, 200);
    const { data } = await res.json();

    assert.equal(data.totalEmissions, subcategoryValue1.totalEmissions);
    assert.equal(data.activityUnits, subcategoryValue1.activityUnits);
    assert.equal(data.activityValue, subcategoryValue1.activityValue);
    assert.equal(
      data.emissionFactorValue,
      subcategoryValue1.emissionFactorValue,
    );
  });

  it("Should not create a sub category with invalid data", async () => {
    const req = mockRequest(invalidSubCategoryValue);
    const res = await upsertSubCategory(req, {
      params: {
        inventory: inventory.inventoryId,
        subcategory: subCategory.subcategoryId,
      },
    });
    assert.equal(res.status, 400);
    const {
      error: { issues },
    } = await res.json();
    assert.equal(issues.length, 4);
  });

  it("Should find a sub category", async () => {
    const req = mockRequest(subcategoryValue1);
    const res = await findSubCategory(req, {
      params: {
        inventory: inventory.inventoryId,
        subcategory: subCategory.subcategoryId,
      },
    });

    const { data } = await res.json();

    assert.equal(res.status, 200);
    assert.equal(data.totalEmissions, co2eq);
    assert.equal(data.activityUnits, activityUnits);
    assert.equal(data.activityValue, activityValue);
    assert.equal(data.emissionFactorValue, emissionFactorValue);
  });

  it("Should not find a non-existing sub category", async () => {
    const req = mockRequest(invalidSubCategoryValue);
    const res = await findSubCategory(req, {
      params: {
        inventory: inventory.inventoryId,
        subcategory: randomUUID(),
      },
    });
    assert.equal(res.status, 404);
  });

  it("Should update a sub category", async () => {
    const req = mockRequest(subcategoryValue1);
    const res = await upsertSubCategory(req, {
      params: {
        inventory: inventory.inventoryId,
        subcategory: subCategory.subcategoryId,
      },
    });
    const { data } = await res.json();
    assert.equal(res.status, 200);
    assert.equal(data.totalEmissions, subcategoryValue1.totalEmissions);
    assert.equal(data.activityUnits, subcategoryValue1.activityUnits);
    assert.equal(data.activityValue, subcategoryValue1.activityValue);
    assert.equal(
      data.emissionFactorValue,
      subcategoryValue1.emissionFactorValue,
    );
  });

  it("Should not update a sub category with invalid data", async () => {
    const req = mockRequest(invalidSubCategoryValue);
    const res = await upsertSubCategory(req, {
      params: {
        inventory: inventory.inventoryId,
        subcategory: subCategory.subcategoryId,
      },
    });
    assert.equal(res.status, 400);
    const {
      error: { issues },
    } = await res.json();
    assert.equal(issues.length, 4);
  });

  it("Should delete a sub category", async () => {
    const req = mockRequest(subcategoryValue2);
    const res = await deleteSubCategory(req, {
      params: {
        inventory: inventory.inventoryId,
        subcategory: subCategory.subcategoryId,
      },
    });
    assert.equal(res.status, 200);
    const { data, deleted } = await res.json();
    assert.equal(deleted, true);
    assert.equal(data.totalEmissions, co2eq);
    assert.equal(data.activityUnits, activityUnits);
    assert.equal(data.activityValue, activityValue);
    assert.equal(data.emissionFactorValue, emissionFactorValue);
  });

  it("Should not delete a non-existing sub sector", async () => {
    const req = mockRequest(subcategoryValue2);
    const res = await deleteSubCategory(req, {
      params: {
        inventory: randomUUID(),
        subcategory: randomUUID(),
      },
    });
    assert.equal(res.status, 404);
  });
});
