import { POST as createSubCategory } from "@/app/api/v0/city/[city]/inventory/[year]/sector/[sector]/subsector/[subsector]/subcategory/route";
import {
  DELETE as deleteSubCategory,
  GET as findSubCategory,
  PATCH as updateSubCategory,
} from "@/app/api/v0/city/[city]/inventory/[year]/sector/[sector]/subsector/[subsector]/subcategory/[subcategory]/route";

import { db } from "@/models";
import { CreateSubCategoryRequest } from "@/util/validation";
import env from "@next/env";
import assert from "node:assert";
import { randomUUID } from "node:crypto";
import { after, before, beforeEach, describe, it } from "node:test";

import { mockRequest, setupTests, testUserID } from "../helpers";

import { SubSectorValue } from "@/models/SubSectorValue";
import { SectorValue } from "@/models/SectorValue";
import { SubCategoryValue } from "@/models/SubCategoryValue";

const sectorValueId = randomUUID();
const subsectorValueId = randomUUID();
const subcategoryValueId = randomUUID();

const locode = "XX_SUBCATEGORY_CITY";
const year = "3000";
const totalEmissions = 44000;
const activityUnits = "UNITS";
const activityValue = 1000;
const emissionFactorValue = 5;

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
  let subsectorValue: SubSectorValue;
  let sectorValue: SectorValue;
  let subcategoryValue: SubCategoryValue;
  before(async () => {
    setupTests();
    const projectDir = process.cwd();
    env.loadEnvConfig(projectDir);
    await db.initialize();
  });

  beforeEach(async () => {
    await db.models.SubSectorValue.destroy({
      where: { subsectorValueId },
    });
    await db.models.SectorValue.destroy({
      where: { sectorValueId },
    });
    await db.models.SubCategoryValue.destroy({
      where: {
        subcategoryValueId,
      },
    });
    await db.models.Inventory.destroy({
      where: { inventoryName: "TEST_SUBCATEGORY_INVENTORY" },
    });
    await db.models.City.destroy({ where: { locode } });

    const city = await db.models.City.create({
      cityId: randomUUID(),
      locode,
    });
    await city.addUser(testUserID);
    const inventory = await db.models.Inventory.create({
      inventoryId: randomUUID(),
      inventoryName: "TEST_SUBCATEGORY_INVENTORY",
      cityId: city.cityId,
    });

    sectorValue = await db.models.SectorValue.create({
      inventoryId: inventory.inventoryId,
      sectorValueId,
      totalEmissions,
    });

    subsectorValue = await db.models.SubSectorValue.create({
      inventoryId: inventory.inventoryId,
      subsectorValueId,
      totalEmissions,
      sectorValueId,
      activityUnits,
      activityValue,
      emissionFactorValue,
    });

    subcategoryValue = await db.models.SubCategoryValue.create({
      inventoryId: inventory.inventoryId,
      subcategoryValueId,
      totalEmissions,
      sectorValueId,
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
      where: { subcategoryValueId },
    });
    const req = mockRequest(subcategoryValue1);
    const res = await createSubCategory(req, {
      params: {
        city: locode,
        year: year,
        sector: sectorValueId,
        subsector: subsectorValueId,
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
    const res = await createSubCategory(req, {
      params: {
        city: locode,
        year: year,
        sector: sectorValueId,
        subsector: subsectorValueId,
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
        city: locode,
        year: year,
        sector: sectorValueId,
        subsector: subsectorValueId,
        subcategory: subcategoryValueId,
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
        city: locode,
        year: year,
        sector: sectorValueId,
        subsector: randomUUID(),
        subcategory: randomUUID(),
      },
    });
    assert.equal(res.status, 404);
  });

  it("Should update a sub category", async () => {
    const req = mockRequest(subcategoryValue1);
    const res = await updateSubCategory(req, {
      params: {
        city: locode,
        year: year,
        sector: sectorValueId,
        subsector: subsectorValueId,
        subcategory: subcategoryValueId,
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
    const res = await updateSubCategory(req, {
      params: {
        city: locode,
        year: year,
        sector: sectorValueId,
        subsector: subsectorValueId,
        subcategory: subcategoryValueId,
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
        city: locode,
        year: year,
        sector: sectorValueId,
        subsector: subsectorValueId,
        subcategory: subcategoryValueId,
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
        city: "XX_INVALID",
        year: "0",
        sector: randomUUID(),
        subsector: randomUUID(),
        subcategory: randomUUID(),
      },
    });
    assert.equal(res.status, 404);
  });
});
