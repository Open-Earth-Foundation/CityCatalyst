import {
  PATCH as updateActivityValue,
  GET as getActivityValue,
  DELETE,
} from "@/app/api/v0/inventory/[inventory]/activity-value/[id]/route";

import { POST as createActivityValue } from "@/app/api/v0/inventory/[inventory]/activity-value/route";

import { db } from "@/models";
import { CreateActivityValueRequest } from "@/util/validation";
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

const ReferenceNumber = "I.1.9.test";

const validCreateActivity: CreateActivityValueRequest = {
  activityData: {
    co2_amount: 100,
    ch4_amount: 100,
    n2o_amount: 100,
  },
  metadata: {
    active_selection: "test1",
  },
  inventoryValue: {
    inputMethodology: "direct-measure",
    gpcReferenceNumber: ReferenceNumber,
    unavailableReason: "Reason for unavailability",
    unavailableExplanation: "Explanation for unavailability",
  },
  dataSource: {
    sourceType: "",
    dataQuality: "high",
    notes: "Some notes regarding the data source",
  },
  gasValues: [
    {
      id: "123e4567-e89b-12d3-a456-426614174001",
      gas: "CO2",
      gasAmount: 1000n,
      emissionsFactor: {
        emissionsPerActivity: 50.5,
        gas: "CO2",
        units: "kg",
      },
    },
    {
      id: "123e4567-e89b-12d3-a456-426614174003",
      gas: "CH4",
      gasAmount: 2000n,
      emissionsFactor: {
        emissionsPerActivity: 25.0,
        gas: "CH4",
        units: "kg",
      },
    },
  ],
};

const updatedActivityValue: CreateActivityValueRequest = {
  activityData: {
    co2_amount: 120,
    ch4_amount: 150,
    n2o_amount: 100,
  },
  metadata: {
    "active-selection": "test1",
  },
  inventoryValue: {
    inputMethodology: "direct-measure",
    gpcReferenceNumber: ReferenceNumber,
    unavailableReason: "Reason for unavailability",
    unavailableExplanation: "Explanation for unavailability",
  },
  dataSource: {
    sourceType: "updated-type",
    dataQuality: "high",
    notes: "Some notes regarding the data source",
  },
  gasValues: [
    {
      id: "123e4567-e89b-12d3-a456-426614174001",
      gas: "CO2",
      gasAmount: 1000n,
      emissionsFactor: {
        emissionsPerActivity: 50.5,
        gas: "CO2",
        units: "kg",
      },
    },
    {
      id: "123e4567-e89b-12d3-a456-426614174003",
      gas: "CH4",
      gasAmount: 4000n,
      emissionsFactor: {
        emissionsPerActivity: 25.0,
        gas: "CH4",
        units: "kg",
      },
    },
  ],
};

const invalidCreateActivity: CreateActivityValueRequest = {
  activityData: {
    "form-test-input1": 40.4,
    "form-test-input2": "132894729485739867398473321",
    "form-test-input3": "agriculture-forestry",
  },
  metadata: {
    "active-selection": "test1",
  },
  dataSource: {
    sourceType: "",
    dataQuality: "high",
    notes: "Some notes regarding the data source",
  },
  gasValues: [
    {
      id: "123e4567-e89b-12d3-a456-426614174001",
      gas: "CO2",
      gasAmount: 1000n,
      emissionsFactor: {
        emissionsPerActivity: 50.5,
        gas: "CO2",
        units: "kg",
      },
    },
    {
      id: "123e4567-e89b-12d3-a456-426614174003",
      gas: "CH4",
      gasAmount: 2000n,
      emissionsFactor: {
        emissionsPerActivity: 25.0,
        gas: "CH4",
        units: "kg",
      },
    },
  ],
};

const activityUnits = "UNITS";
const activityValue = 1000;
const co2eq = 44000n;
const locode = "XX_INVENTORY_CITY_ACTIVITY_VALUE";
// Matches name given by CDP for API testing
const cityName = "Open Earth Foundation API City Discloser activity value";
const cityCountry = "United Kingdom of Great Britain and Northern Ireland";
const inventoryName = "TEST_INVENTORY_INVENTORY_ACTIVITY_VALUE";
const sectorName = "XX_INVENTORY_TEST_SECTOR_ACTIVITY_VALUE";
const subcategoryName = "XX_INVENTORY_TEST_SUBCATEGORY_ACTIVITY_VALUE";
const subsectorName = "XX_INVENTORY_TEST_SUBSECTOR_1_ACTIVITY_VALUE";

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
    });

    sector = await db.models.Sector.create({
      sectorId: randomUUID(),
      sectorName,
    });

    subSector = await db.models.SubSector.create({
      subsectorId: randomUUID(),
      sectorId: sector.sectorId,
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
      data.activityDataJsonb.co2_amount,
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
      data.activityDataJsonb.co2_amount,
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
      data.activityDataJsonb.co2_amount,
      updatedActivityValue.activityData.co2_amount,
    );
  });

  // test good delete
  it("should delete an activity value", async () => {
    const req = mockRequest();
    const res = await DELETE(req, {
      params: {
        inventory: inventory.inventoryId,
        id: createdActivityValue.id,
      },
    });

    const { data } = await res.json();

    assert.equal(res.status, 200);
    assert.equal(data, true);
  });
});
