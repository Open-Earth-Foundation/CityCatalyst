import {
  DELETE as deleteActivityValue,
  GET as getActivityValue,
  PATCH as updateActivityValue,
} from "@/app/api/v0/inventory/[inventory]/activity-value/[id]/route";

import {
  DELETE as deleteAllActivitiesInSubsector,
  POST as createActivityValue,
} from "@/app/api/v0/inventory/[inventory]/activity-value/route";

import { db } from "@/models";
import assert from "node:assert";
import { randomUUID } from "node:crypto";
import { after, before, describe, it } from "node:test";

import { mockRequest, setupTests, testUserID } from "../helpers";
import { City } from "@/models/City";
import { Inventory } from "@/models/Inventory";
import { SubCategory } from "@/models/SubCategory";
import { SubSector } from "@/models/SubSector";
import { InventoryValue } from "@/models/InventoryValue";
import { ActivityValue } from "@/models/ActivityValue";
import { Sector } from "@/models/Sector";
import {
  activityUnits,
  activityValue,
  cityCountry,
  cityName,
  co2eq,
  invalidCreateActivity,
  inventoryName,
  locode,
  ReferenceNumber,
  sectorName,
  subcategoryName,
  subsectorName,
  updatedActivityValue,
  validCreateActivity,
} from "./activity_value_data";
import {
  GlobalWarmingPotentialTypeEnum,
  InventoryTypeEnum,
} from "@/util/enums";

describe("Activity Value API", () => {
  let city: City;
  let inventory: Inventory;
  let sector: Sector;
  let subCategory: SubCategory;
  let subSector: SubSector;
  let inventoryValue: InventoryValue;
  let createdActivityValue: ActivityValue;
  let createdActivityValue2: ActivityValue;

  before(async () => {
    setupTests();
    await db.initialize();

    await db.models.Sector.destroy({
      where: { sectorName },
    });

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

    city = await db.models.City.create({
      cityId: randomUUID(),
      name: cityName,
      country: cityCountry,
      locode,
    });

    await db.models.User.upsert({ userId: testUserID, name: "TEST_USER" });
    await city.addUser(testUserID);

    // create an inventory
    inventory = await db.models.Inventory.create({
      inventoryId: randomUUID(),
      inventoryName: inventoryName,
      cityId: city.cityId,
      inventoryType: InventoryTypeEnum.GPC_BASIC,
      globalWarmingPotentialType: GlobalWarmingPotentialTypeEnum.ar6,
    });

    sector = await db.models.Sector.create({
      sectorId: randomUUID(),
      sectorName,
    });

    subSector = await db.models.SubSector.create({
      subsectorId: randomUUID(),
      sectorId: sector.sectorId,
      referenceNumber: ReferenceNumber,
      subsectorName,
    });

    subCategory = await db.models.SubCategory.create({
      subcategoryId: randomUUID(),
      subsectorId: subSector.subsectorId,
      referenceNumber: ReferenceNumber,
      subcategoryName,
    });

    await db.models.InventoryValue.destroy({
      where: { inventoryId: inventory.inventoryId },
    });

    inventoryValue = await db.models.InventoryValue.create({
      inventoryId: inventory.inventoryId,
      id: randomUUID(),
      subCategoryId: subCategory.subcategoryId,
      subSectorId: subSector.subsectorId,
      gpcReferenceNumber: ReferenceNumber,
      co2eq,
      activityUnits,
      inputMethodology: "direct-measure",
      activityValue,
    });
  });

  // clean up after the test suite
  after(async () => {
    await db.models.City.destroy({ where: { locode } });

    await db.models.Inventory.destroy({
      where: { inventoryId: inventory.inventoryId },
    });

    await db.models.ActivityValue.destroy({
      where: { id: createdActivityValue2.id },
    });

    await db.models.Sector.destroy({
      where: { sectorName },
    });

    await db.models.SubCategory.destroy({
      where: { subcategoryName },
    });

    await db.models.SubSector.destroy({
      where: { subsectorName },
    });

    await db.models.InventoryValue.destroy({
      where: { inventoryId: inventory.inventoryId },
    });

    if (db.sequelize) await db.sequelize.close();
  });

  it("should not create an activity value with invalid data", async () => {
    const req = mockRequest(invalidCreateActivity);
    const res = await createActivityValue(req, {
      params: {
        inventory: inventory.inventoryId,
      },
    });
    assert.equal(res.status, 400);
  });

  it("should create an activity, creating an inventory value with inventoryValue params", async () => {
    const findInventory = await db.models.Inventory.findOne({
      where: {
        inventoryName: inventoryName,
      },
    });

    assert.equal(findInventory?.inventoryId, inventory.inventoryId);

    const req = mockRequest(validCreateActivity);
    const res = await createActivityValue(req, {
      params: {
        inventory: inventory.inventoryId,
      },
    });

    assert.equal(res.status, 200);
    const { data } = await res.json();

    createdActivityValue2 = data;

    assert.equal(
      data.activityData.co2_amount,
      validCreateActivity.activityData.co2_amount,
    );

    assert.notEqual(data.inventoryValueId, null);
  });

  it("should create an activity value with inventoryValueId", async () => {
    const findInventory = await db.models.Inventory.findOne({
      where: {
        inventoryName: inventoryName,
      },
    });

    assert.equal(findInventory?.inventoryId, inventory.inventoryId);

    const req = mockRequest({
      ...validCreateActivity,
      inventoryValueId: inventoryValue.id,
      inventoryValue: undefined,
    });
    const res = await createActivityValue(req, {
      params: {
        inventory: inventory.inventoryId,
      },
    });

    assert.equal(res.status, 200);
    const { data } = await res.json();
    createdActivityValue = data;

    assert.equal(
      data.activityData.co2_amount,
      validCreateActivity.activityData.co2_amount,
    );

    assert.notEqual(data.inventoryValueId, null);
  });

  // test getting an activity value
  it("should get an activity value", async () => {
    const req = mockRequest();
    const res = await getActivityValue(req, {
      params: {
        inventory: inventory.inventoryId,
        id: createdActivityValue.id,
      },
    });

    const { data } = await res.json();

    assert.equal(res.status, 200);
    assert.equal(data.co2eq, createdActivityValue.co2eq);
    assert.equal(data.co2eqYears, createdActivityValue.co2eqYears);
    assert.equal(data.inventoryValueId, inventoryValue.id);
  });

  it("should not get an activity value with invalid id", async () => {
    const fakeId = randomUUID();
    const req = mockRequest();
    const res = await getActivityValue(req, {
      params: {
        inventory: inventory.inventoryId,
        id: fakeId,
      },
    });
    const { data } = await res.json();
    assert.equal(data, null);
  });

  // test patch, break patch
  it("should update an activity value", async () => {
    const req = mockRequest({
      ...createdActivityValue,
      activityData: updatedActivityValue.activityData,
      metaData: updatedActivityValue.metadata,
    });
    const res = await updateActivityValue(req, {
      params: {
        inventory: inventory.inventoryId,
        id: createdActivityValue.id,
      },
    });

    const { data } = await res.json();

    assert.equal(res.status, 200);
    assert.equal(
      data.activityData.co2_amount,
      updatedActivityValue.activityData.co2_amount,
    );
  });

  //  test good delete
  it("should delete an activity value", async () => {
    const req = mockRequest();
    const res = await deleteActivityValue(req, {
      params: {
        inventory: inventory.inventoryId,
        id: createdActivityValue.id,
      },
    });

    const { data } = await res.json();

    assert.equal(res.status, 200);
    assert.equal(data, true);
  });

  // test delete all activities in subsector
  it("should delete all activities in a subsector", async () => {
    const findInventory = await db.models.Inventory.findOne({
      where: {
        inventoryName: inventoryName,
      },
    });

    assert.equal(findInventory?.inventoryId, inventory.inventoryId);

    const req1 = mockRequest({
      ...validCreateActivity,
      inventoryValueId: inventoryValue.id,
      inventoryValue: undefined,
    });

    const req2 = mockRequest({
      ...validCreateActivity,
      inventoryValueId: inventoryValue.id,
      inventoryValue: undefined,
    });

    const res1 = await createActivityValue(req1, {
      params: {
        inventory: inventory.inventoryId,
      },
    });

    const res2 = await createActivityValue(req2, {
      params: {
        inventory: inventory.inventoryId,
      },
    });

    assert.equal(res1.status, 200);
    assert.equal(res2.status, 200);

    // delete all activities in subsector
    const req3 = mockRequest(null, {
      subSectorId: subSector.subsectorId,
    });

    // pass subsectorId as query parameter
    const res3 = await deleteAllActivitiesInSubsector(req3, {
      params: {
        inventory: inventory.inventoryId,
      },
    });

    const { data } = await res3.json();
    assert.equal(res3.status, 200);
  });
});
