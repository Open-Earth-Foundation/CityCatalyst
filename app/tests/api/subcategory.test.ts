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
import { SectorValue } from "@/models/SectorValue";
import { SubCategoryValue } from "@/models/SubCategoryValue";
import { SubSectorValue } from "@/models/SubSectorValue";
import { SubCategory } from "@/models/SubCategory";
import { Op } from "sequelize";

const locode = "XX_SUBCATEGORY_CITY";
const totalEmissions = 44000;
const activityUnits = "UNITS";
const activityValue = 1000;
const emissionFactorValue = 12;
const inventoryName = "TEST_SUBCATEGORY_INVENTORY";
const subcategoryName = "TEST_SUBCATEGORY_SUBCATEGORY";

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
  let subSectorValue: SubSectorValue;
  let sectorValue: SectorValue;
  let subCategory: SubCategory;
  let subCategoryValue: SubCategoryValue;

  before(async () => {
    setupTests();
    await db.initialize();

    await db.models.SubCategory.destroy({
      where: { subcategoryName },
    });
    await db.models.SubSector.destroy({
      where: { subsectorName: { [Op.like]: "XX_INVENTORY_%" } },
    });
    await db.models.City.destroy({ where: { locode } });

    const prevInventory = await db.models.Inventory.findOne({
      where: { inventoryName },
    });
    if (prevInventory) {
      await db.models.SubSectorValue.destroy({
        where: { inventoryId: prevInventory.inventoryId },
      });
      await db.models.SectorValue.destroy({
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

    sectorValue = await db.models.SectorValue.create({
      inventoryId: inventory.inventoryId,
      sectorValueId: randomUUID(),
      totalEmissions,
    });

    subSectorValue = await db.models.SubSectorValue.create({
      inventoryId: inventory.inventoryId,
      subsectorValueId: randomUUID(),
      totalEmissions,
      sectorValueId: sectorValue.sectorValueId,
      activityUnits,
      activityValue,
      emissionFactorValue,
    });

    subCategory = await db.models.SubCategory.create({
      subcategoryId: randomUUID(),
      subcategoryName,
    });
  });

  beforeEach(async () => {
    await db.models.SubCategoryValue.destroy({
      where: { subcategoryValueId: inventory.inventoryId },
    });
    subCategoryValue = await db.models.SubCategoryValue.create({
      inventoryId: inventory.inventoryId,
      subcategoryValueId: randomUUID(),
      subcategoryId: subCategory.subcategoryId,
      totalEmissions,
      sectorValueId: sectorValue.sectorValueId,
      activityUnits,
      activityValue,
      emissionFactorValue,
    });
  });

  after(async () => {
    if (db.sequelize) await db.sequelize.close();
  });

  it("Should create a sub category", async () => {
    await db.models.SubCategoryValue.destroy({
      where: { subcategoryValueId: subCategoryValue.subcategoryValueId },
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
    assert.equal(data.totalEmissions, totalEmissions);
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
    assert.equal(data.totalEmissions, totalEmissions);
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
