import {
  DELETE as deleteInventory,
  GET as findInventory,
  PATCH as updateInventory,
} from "@/app/api/v0/city/[city]/inventory/[year]/route";
import { GET as calculateProgress } from "@/app/api/v0/city/[city]/inventory/[year]/progress/route";
import { POST as createInventory } from "@/app/api/v0/city/[city]/inventory/route";
import { db } from "@/models";
import { CreateInventoryRequest } from "@/util/validation";
import assert from "node:assert";
import { randomUUID } from "node:crypto";
import { after, before, beforeEach, describe, it } from "node:test";
import { Op } from "sequelize";
import { createRequest, setupTests, testUserID } from "../helpers";
import { SubSectorAttributes } from "@/models/SubSector";
import { City } from "@/models/City";

const locode = "XX_INVENTORY_CITY";
const inventoryName = "TEST_INVENTORY_INVENTORY";

const inventory: CreateInventoryRequest = {
  inventoryName,
  year: 3000,
  totalEmissions: 1337,
};

const inventory2: CreateInventoryRequest = {
  inventoryName,
  year: 3001,
  totalEmissions: 1338,
};

const invalidInventory = {
  inventoryName: "",
  year: 0,
  totalEmissions: "246kg co2eq",
};

const sector = {
  sectorId: randomUUID(),
  sectorName: "XX_INVENTORY_TEST_SECTOR",
};

const subSector1 = {
  subsectorId: randomUUID(),
  sectorId: sector.sectorId,
  subsectorName: "XX_INVENTORY_TEST_SUBSECTOR_1",
};

const subSector2 = {
  subsectorId: randomUUID(),
  sectorId: sector.sectorId,
  subsectorName: "XX_INVENTORY_TEST_SUBSECTOR_2",
};

const subCategory = {
  subcategoryId: randomUUID(),
  subcategoryName: "XX_INVENTORY_TEST_SUBCATEGORY",
  sectorId: sector.sectorId,
  subSectorId: subSector2.subsectorId,
};

const subSectorValue = {
  activityValue: 10,
  activityUnits: "kg",
  emissionFactorValue: 10,
  totalEmissions: 100,
  subsectorId: subSector1.subsectorId,
};

const subCategoryValue = {
  activityValue: 20,
  activityUnits: "km",
  emissionFactorValue: 20,
  totalEmissions: 400,
  subsectorId: subSector2.subsectorId,
  subcategoryId: subCategory.subcategoryId,
};

describe("Inventory API", () => {
  let city: City;
  before(async () => {
    setupTests();
    await db.initialize();
    // this also deletes all Sector/SubSectorValue instances associated with it (cascade)
    await db.models.Inventory.destroy({
      where: { inventoryName },
    });
    await db.models.DataSource.destroy({
      where: { name: { [Op.like]: "XX_INVENTORY_TEST_%" } },
    });
    await db.models.City.destroy({ where: { locode } });
    await db.models.SubCategory.destroy({
      where: { subcategoryId: subCategory.subcategoryId },
    });
    await db.models.SubSector.destroy({
      where: { subsectorId: subSector1.subsectorId },
    });
    await db.models.SubSector.destroy({
      where: { subsectorId: subSector2.subsectorId },
    });
    await db.models.Sector.destroy({ where: { sectorId: sector.sectorId } });
    city = await db.models.City.create({ cityId: randomUUID(), locode });
    await db.models.User.upsert({ userId: testUserID, name: "TEST_USER" });
    await city.addUser(testUserID);
    await db.models.Sector.create(sector);
    await db.models.SubSector.create(subSector1);
    await db.models.SubSector.create(subSector2);
    await db.models.SubCategory.create(subCategory);
  });

  beforeEach(async () => {
    await db.models.Inventory.destroy({
      where: { cityId: city.cityId },
    });
    const inventoryId: string = randomUUID();
    await db.models.Inventory.create({
      inventoryId,
      cityId: city.cityId,
      ...inventory,
    });
    await db.models.SubSectorValue.create({
      inventoryId,
      subsectorValueId: randomUUID(),
      ...subSectorValue,
    });
    await db.models.SubCategoryValue.create({
      inventoryId,
      subcategoryValueId: randomUUID(),
      ...subCategoryValue,
    });
  });

  after(async () => {
    await db.models.SubCategory.destroy({
      where: { subcategoryId: subCategory.subcategoryId },
    });
    await db.models.SubSector.destroy({
      where: { subsectorId: subSector1.subsectorId },
    });
    await db.models.SubSector.destroy({
      where: { subsectorId: subSector2.subsectorId },
    });
    await db.models.Sector.destroy({ where: { sectorId: sector.sectorId } });
    await db.models.City.destroy({ where: { locode } });
    if (db.sequelize) await db.sequelize.close();
  });

  it("should create an inventory", async () => {
    await db.models.Inventory.destroy({
      where: { year: inventory.year },
    });
    const url = "http://localhost:3000/api/v0/city" + locode;
    const req = createRequest(url, inventory);
    const res = await createInventory(req, {
      params: { city: locode },
    });
    assert.equal(res.status, 200);
    const { data } = await res.json();
    assert.equal(data.inventoryName, inventory.inventoryName);
    assert.equal(data.year, inventory.year);
    assert.equal(data.totalEmissions, inventory.totalEmissions);
  });

  it("should not create an inventory with invalid data", async () => {
    const url = "http://localhost:3000/api/v0/city/" + locode;
    const req = createRequest(url, invalidInventory);
    const res = await createInventory(req, {
      params: { city: locode },
    });
    assert.equal(res.status, 400);
    const {
      error: { issues },
    } = await res.json();
    assert.equal(issues.length, 3);
  });

  it("should find an inventory", async () => {
    const url = `http://localhost:3000/api/v0/city/${locode}/inventory/${inventory.year}`;
    const req = createRequest(url);
    const res = await findInventory(req, {
      params: { city: locode, year: inventory.year.toString() },
    });
    assert.equal(res.status, 200);
    const { data } = await res.json();
    assert.equal(data.inventoryName, inventory.inventoryName);
    assert.equal(data.year, inventory.year);
    assert.equal(data.totalEmissions, inventory.totalEmissions);
  });

  it("should find an inventory with csv format", async () => {
    const url = `http://localhost:3000/api/v0/city/${locode}/inventory/${inventory.year}?format=csv`;
    const req = createRequest(url);
    const res = await findInventory(req, {
      params: { city: locode, year: inventory.year.toString() },
    });
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("content-type"), "text/csv");
    assert.ok(res.headers.get("content-disposition")?.startsWith("attachment"));
    const csv = await res.text();
    const lines = csv.split("\n");
    assert.ok(lines.length > 0);
    const headers = lines[0].split(",");
    assert.equal(headers.length, 6);
    assert.deepEqual(headers, [
      "Inventory Reference",
      "Total Emissions",
      "Activity Units",
      "Activity Value",
      "Emission Factor Value",
      "Datasource ID",
    ]);
    assert.ok(lines.length > 1);
    assert.strictEqual(lines.length, 3);
    assert.ok(lines.slice(1).every((line) => line.split(",").length == 6));
  });

  it("should find an inventory with xls format", async () => {
    const url = `http://localhost:3000/api/v0/city/${locode}/inventory/${inventory.year}?format=xls`;
    const req = createRequest(url);
    const res = await findInventory(req, {
      params: { city: locode, year: inventory.year.toString() },
    });
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("content-type"), "application/vnd.ms-excel");
    assert.ok(res.headers.get("content-disposition")?.startsWith("attachment"));
    const body = await res.blob();
  });

  it("should not find non-existing inventories", async () => {
    const url = "http://localhost:3000/api/v0/city/XX_INVALID/inventory/0";
    const req = createRequest(url, invalidInventory);
    const res = await findInventory(req, {
      params: { city: "XX_INVALID", year: "0" },
    });
    assert.equal(res.status, 404);
  });

  it("should update an inventory", async () => {
    const url = `http://localhost:3000/api/v0/city/${locode}/inventory/${inventory.year}`;
    const req = createRequest(url, inventory2);
    const res = await updateInventory(req, {
      params: { city: locode, year: inventory.year.toString() },
    });
    assert.equal(res.status, 200);
    const { data } = await res.json();
    assert.equal(data.inventoryName, inventory2.inventoryName);
    assert.equal(data.year, inventory2.year);
    assert.equal(data.totalEmissions, inventory2.totalEmissions);
  });

  it("should not update an inventory with invalid data", async () => {
    const url = `http://localhost:3000/api/v0/city/${locode}/inventory/${inventory.year}`;
    const req = createRequest(url, invalidInventory);
    const res = await updateInventory(req, {
      params: { city: locode, year: inventory.year.toString() },
    });
    assert.equal(res.status, 400);
    const {
      error: { issues },
    } = await res.json();
    assert.equal(issues.length, 3);
  });

  it("should delete an inventory", async () => {
    const url = `http://localhost:3000/api/v0/city/${locode}/inventory/${inventory.year}`;
    const req = createRequest(url);
    const res = await deleteInventory(req, {
      params: { city: locode, year: inventory.year.toString() },
    });
    assert.equal(res.status, 200);
    const { data, deleted } = await res.json();
    assert.equal(deleted, true);
    assert.equal(data.inventoryName, inventory.inventoryName);
    assert.equal(data.year, inventory.year);
    assert.equal(data.totalEmissions, inventory.totalEmissions);
  });

  it("should not delete a non-existing inventory", async () => {
    const url = `http://localhost:3000/api/v0/city/XX_INVALID/inventory/0`;
    const req = createRequest(url);
    const res = await deleteInventory(req, {
      params: { city: "XX_INVALID", year: "0" },
    });
    assert.equal(res.status, 404);
  });

  it("should calculate progress for an inventory", async () => {
    // setup mock data
    const existingInventory = await db.models.Inventory.findOne({
      where: { year: inventory.year },
    });
    assert.notEqual(existingInventory, null);
    const sectorNames = ["TEST1", "TEST2", "TEST3"];
    const userSource = await db.models.DataSource.create({
      datasourceId: randomUUID(),
      sourceType: "user",
      name: "XX_INVENTORY_TEST_USER",
    });
    const thirdPartySource = await db.models.DataSource.create({
      datasourceId: randomUUID(),
      sourceType: "third_party",
      name: "XX_INVENTORY_TEST_THIRD_PARTY",
    });
    const sources = [userSource, thirdPartySource, null];

    for (const sectorName of sectorNames) {
      const sectorId = randomUUID();
      await db.models.Sector.create({
        sectorId,
        sectorName: "XX_INVENTORY_" + sectorName,
      });
      const sectorValueId = randomUUID();
      await db.models.SectorValue.create({
        sectorValueId,
        sectorId,
        inventoryId: existingInventory!.inventoryId,
      });
      for (let i = 0; i < sectorNames.length; i++) {
        const subsectorId = randomUUID();
        await db.models.SubSector.create({
          subsectorId,
          sectorId,
          subsectorName: "XX_INVENTORY_" + sectorName + "_" + sectorNames[i],
        });
        if (sources[i] != null) {
          await db.models.SubSectorValue.create({
            subsectorValueId: randomUUID(),
            subsectorId,
            sectorValueId,
            datasourceId: sources[i]?.datasourceId,
            inventoryId: existingInventory!.inventoryId,
          });
        }
      }
    }

    const url = `http://localhost:3000/api/v0/city/${locode}/inventory/${inventory.year}/progress`;
    const req = createRequest(url);
    const res = await calculateProgress(req, {
      params: { city: locode, year: inventory.year.toString() },
    });

    assert.equal(res.status, 200);
    const { totalProgress, sectorProgress } = (await res.json()).data;
    const cleanedSectorProgress = sectorProgress.map(
      ({
        sector,
        subSectors,
        ...progress
      }: {
        sector: { sectorName: string; sectorId: string; completed: boolean };
        subSectors: Array<SubSectorAttributes & { completed: boolean }>;
      }) => {
        assert.notEqual(sector.sectorId, null);
        assert.equal(subSectors.length, 3);
        for (const subSector of subSectors) {
          assert.notEqual(subSector.completed, null);
        }
        return { sector: { sectorName: sector.sectorName }, ...progress };
      },
    );
    assert.deepEqual(cleanedSectorProgress, [
      {
        total: 3,
        thirdParty: 1,
        uploaded: 1,
        sector: { sectorName: "XX_INVENTORY_TEST1" },
      },
      {
        total: 3,
        thirdParty: 1,
        uploaded: 1,
        sector: { sectorName: "XX_INVENTORY_TEST2" },
      },
      {
        total: 3,
        thirdParty: 1,
        uploaded: 1,
        sector: { sectorName: "XX_INVENTORY_TEST3" },
      },
    ]);
    assert.deepEqual(totalProgress, { total: 9, thirdParty: 3, uploaded: 3 });
  });
});
