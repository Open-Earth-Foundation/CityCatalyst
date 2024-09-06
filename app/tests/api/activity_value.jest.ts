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
import { CreateActivityValueRequest } from "@/util/validation";
import { randomUUID } from "node:crypto";
import { mockRequest, setupTests, testUserID } from "../helpers";
import { City } from "@/models/City";
import { Inventory } from "@/models/Inventory";
import { SubCategory } from "@/models/SubCategory";
import { SubSector } from "@/models/SubSector";
import { InventoryValue } from "@/models/InventoryValue";
import { ActivityValue } from "@/models/ActivityValue";
import { Sector } from "@/models/Sector";
import { describe, it, afterAll, beforeAll, expect } from "@jest/globals";

const ReferenceNumber = "I.1.1";

const validCreateActivity: CreateActivityValueRequest = {
  activityData: {
    co2_amount: 100,
    ch4_amount: 100,
    n2o_amount: 100,
    "residential-building-type": "building-type-all",
    "residential-building-fuel-type": "fuel-type-charcoal",
    "residential-buildings-fuel-source": "source",
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
    ch4_amount: 160,
    n2o_amount: 100,
    "residential-building-type": "building-type-all",
    "residential-building-fuel-type": "fuel-type-anthracite",
    "residential-buildings-fuel-source": "source-edit",
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

/** skipped tests are running with the with node test runner **/
describe("Activity Value API", () => {
  let city: City;
  let inventory: Inventory;
  let sector: Sector;
  let subCategory: SubCategory;
  let subSector: SubSector;
  let inventoryValue: InventoryValue;
  let createdActivityValue: ActivityValue;
  let createdActivityValue2: ActivityValue;

  beforeAll(async () => {
    setupTests();
    await db.initialize();

    // Perform model cleanup and creation
    await db.models.Sector.destroy({ where: { sectorName } });
    await db.models.SubCategory.destroy({ where: { subcategoryName } });
    await db.models.SubSector.destroy({ where: { subsectorName } });
    await db.models.City.destroy({ where: { locode } });

    const prevInventory = await db.models.Inventory.findOne({
      where: { inventoryName },
    });
    if (prevInventory) {
      await db.models.InventoryValue.destroy({
        where: { inventoryId: prevInventory.inventoryId },
      });
      await db.models.Inventory.destroy({ where: { inventoryName } });
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

  afterAll(async () => {
    await db.models.City.destroy({ where: { locode } });
    await db.models.Inventory.destroy({
      where: { inventoryId: inventory.inventoryId },
    });
    await db.models.ActivityValue.destroy({
      where: { id: createdActivityValue2.id },
    });
    await db.models.Sector.destroy({ where: { sectorName } });
    await db.models.SubCategory.destroy({ where: { subcategoryName } });
    await db.models.SubSector.destroy({ where: { subsectorName } });
    await db.models.InventoryValue.destroy({
      where: { inventoryId: inventory.inventoryId },
    });

    if (db.sequelize) await db.sequelize.close();
  });

  it("should not create an activity value with invalid data", async () => {
    const req = mockRequest(invalidCreateActivity);
    const res = await createActivityValue(req, {
      params: { inventory: inventory.inventoryId },
    });
    expect(res.status).toBe(400);
  });

  it.skip("should create an activity, creating an inventory value with inventoryValue params", async () => {
    const findInventory = await db.models.Inventory.findOne({
      where: { inventoryName },
    });
    expect(findInventory?.inventoryId).toBe(inventory.inventoryId);

    const req = mockRequest(validCreateActivity);
    const res = await createActivityValue(req, {
      params: { inventory: inventory.inventoryId },
    });

    expect(res.status).toBe(200);
    const { data } = await res.json();
    createdActivityValue2 = data;
    expect(data.activityData.co2_amount).toBe(
      validCreateActivity.activityData.co2_amount,
    );
    expect(data.inventoryValueId).not.toBeNull();
  });

  it.skip("should create an activity value with inventoryValueId", async () => {
    const findInventory = await db.models.Inventory.findOne({
      where: { inventoryName },
    });
    expect(findInventory?.inventoryId).toBe(inventory.inventoryId);

    const req = mockRequest({
      ...validCreateActivity,
      inventoryValueId: inventoryValue.id,
      inventoryValue: undefined,
    });
    const res = await createActivityValue(req, {
      params: { inventory: inventory.inventoryId },
    });

    expect(res.status).toBe(200);
    const { data } = await res.json();
    createdActivityValue = data;
    expect(data.activityData.co2_amount).toBe(
      validCreateActivity.activityData.co2_amount,
    );
    expect(data.inventoryValueId).not.toBeNull();
  });

  it.skip("should get an activity value", async () => {
    const req = mockRequest();
    const res = await getActivityValue(req, {
      params: {
        inventory: inventory.inventoryId,
        id: createdActivityValue.id,
      },
    });

    const { data } = await res.json();
    expect(res.status).toBe(200);
    expect(data.co2eq).toBe(createdActivityValue.co2eq);
    expect(data.co2eqYears).toBe(createdActivityValue.co2eqYears);
    expect(data.inventoryValueId).toBe(inventoryValue.id);
  });

  it("should not get an activity value with invalid id", async () => {
    const fakeId = randomUUID();
    const req = mockRequest();
    const res = await getActivityValue(req, {
      params: { inventory: inventory.inventoryId, id: fakeId },
    });

    const { data } = await res.json();
    expect(data).toBeNull();
  });

  it.skip("should update an activity value", async () => {
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
    expect(res.status).toBe(200);
    expect(data.activityData.co2_amount).toBe(
      updatedActivityValue.activityData.co2_amount,
    );
  });

  it.skip("should delete an activity value", async () => {
    const req = mockRequest();
    const res = await deleteActivityValue(req, {
      params: {
        inventory: inventory.inventoryId,
        id: createdActivityValue.id,
      },
    });

    const { data } = await res.json();
    expect(res.status).toBe(200);
    expect(data).toBe(true);
  });

  it.skip("should delete all activities in a subsector", async () => {
    const findInventory = await db.models.Inventory.findOne({
      where: { inventoryName },
    });
    expect(findInventory?.inventoryId).toBe(inventory.inventoryId);

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
      params: { inventory: inventory.inventoryId },
    });
    const res2 = await createActivityValue(req2, {
      params: { inventory: inventory.inventoryId },
    });

    expect(res1.status).toBe(200);
    expect(res2.status).toBe(200);

    const req3 = mockRequest(null, { subSectorId: subSector.subsectorId });
    const res3 = await deleteAllActivitiesInSubsector(req3, {
      params: { inventory: inventory.inventoryId },
    });

    const { data } = await res3.json();
    expect(res3.status).toBe(200);
  });
});
