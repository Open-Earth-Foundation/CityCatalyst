import {
  DELETE as deleteInventory,
  GET as findInventory,
  PATCH as updateInventory,
} from "@/app/api/v0/inventory/[inventory]/route";
import { GET as calculateProgress } from "@/app/api/v0/inventory/[inventory]/progress/route";
import { POST as createInventory } from "@/app/api/v0/city/[city]/inventory/route";
import {
  POST as submitInventory
} from "@/app/api/v0/inventory/[inventory]/cdp/route";
import { db } from "@/models";
import { CreateInventoryRequest } from "@/util/validation";
import assert from "node:assert";
import { randomUUID } from "node:crypto";
import { after, before, beforeEach, describe, it } from "node:test";
import { Op } from "sequelize";
import { createRequest, mockRequest, setupTests, testUserID } from "../helpers";
import { SubSector, SubSectorAttributes } from "@/models/SubSector";
import { City } from "@/models/City";
import { Inventory } from "@/models/Inventory";
import { Sector } from "@/models/Sector";
import { SubCategory } from "@/models/SubCategory";

const locode = "XX_INVENTORY_CITY";
// Matches name given by CDP for API testing
const cityName = "Open Earth Foundation API City Discloser";
const cityCountry = undefined;
const inventoryName = "TEST_INVENTORY_INVENTORY";
const sectorName = "XX_INVENTORY_TEST_SECTOR";
const subcategoryName = "XX_INVENTORY_TEST_SUBCATEGORY";
const subsectorName = "XX_INVENTORY_TEST_SUBSECTOR_1";
const subSectorName2 = "XX_INVENTORY_TEST_SUBSECTOR_2";

process.env.CDP_MODE = "test";

const inventoryData: CreateInventoryRequest = {
  inventoryName,
  year: 3000,
  totalEmissions: 1337,
};

const inventoryData2: CreateInventoryRequest = {
  inventoryName,
  year: 3001,
  totalEmissions: 1338,
};

const invalidInventory = {
  inventoryName: "",
  year: 0,
  totalEmissions: "246kg co2eq",
};

const inventoryValue = {
  activityValue: 20,
  activityUnits: "km",
  emissionFactorValue: 20,
  totalEmissions: 400,
};

describe("Inventory API", () => {
  let city: City;
  let inventory: Inventory;
  let sector: Sector;
  let subCategory: SubCategory;
  let subSector: SubSector;
  let subSector2: SubSector;

  before(async () => {
    setupTests();
    await db.initialize();
    // this also deletes all Sector/SubSectorValue instances associated with it (cascade)
    await db.models.Inventory.destroy({
      where: { inventoryName },
    });
    await db.models.DataSource.destroy({
      where: { datasetName: { [Op.like]: "XX_INVENTORY_TEST_%" } },
    });
    await db.models.Sector.destroy({
      where: { sectorName: { [Op.like]: "XX_INVENTORY_TEST%" } },
    });
    await db.models.City.destroy({ where: { locode } });
    await db.models.SubCategory.destroy({
      where: { subcategoryName },
    });
    await db.models.SubSector.destroy({
      where: { subsectorName: { [Op.like]: "XX_INVENTORY_%" } },
    });
    await db.models.Sector.destroy({
      where: { sectorName: { [Op.like]: "XX_INVENTORY_TEST%" } },
    });
    await db.models.Sector.destroy({ where: { sectorName } });
    await db.models.Sector.destroy({
      where: { sectorName: { [Op.like]: "XX_INVENTORY_PROGRESS_TEST%" } },
    });
    city = await db.models.City.create({ cityId: randomUUID(), name: cityName, country: cityCountry, locode });
    await db.models.User.upsert({ userId: testUserID, name: "TEST_USER" });
    await city.addUser(testUserID);
    sector = await db.models.Sector.create({
      sectorId: randomUUID(),
      sectorName,
    });
    subSector = await db.models.SubSector.create({
      subsectorId: randomUUID(),
      sectorId: sector.sectorId,
      subsectorName: subsectorName,
    });
    subSector2 = await db.models.SubSector.create({
      subsectorId: randomUUID(),
      sectorId: sector.sectorId,
      subsectorName: subSectorName2,
    });
    subCategory = await db.models.SubCategory.create({
      subcategoryId: randomUUID(),
      subsectorId: subSector2.subsectorId,
    });
  });

  beforeEach(async () => {
    await db.models.Inventory.destroy({ where: { inventoryName } });
    inventory = await db.models.Inventory.create({
      inventoryId: randomUUID(),
      cityId: city.cityId,
      ...inventoryData,
    });
    await db.models.InventoryValue.create({
      id: randomUUID(),
      inventoryId: inventory.inventoryId,
      subCategoryId: subCategory.subcategoryId,
      ...inventoryValue,
    });
  });

  after(async () => {
    await db.models.SubCategory.destroy({
      where: { subcategoryId: subCategory.subcategoryId },
    });
    await db.models.SubSector.destroy({
      where: { subsectorId: subSector.subsectorId },
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
      where: { inventoryName },
    });
    const req = mockRequest(inventoryData);
    const res = await createInventory(req, {
      params: { city: city.cityId },
    });
    assert.equal(res.status, 200);
    const { data } = await res.json();
    assert.equal(data.inventoryName, inventory.inventoryName);
    assert.equal(data.year, inventory.year);
    assert.equal(data.totalEmissions, inventory.totalEmissions);
  });

  it("should not create an inventory with invalid data", async () => {
    const req = mockRequest(invalidInventory);
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
    const req = mockRequest();
    const res = await findInventory(req, {
      params: { inventory: inventory.inventoryId },
    });
    assert.equal(res.status, 200);
    const { data } = await res.json();
    assert.equal(data.inventoryName, inventory.inventoryName);
    assert.equal(data.year, inventory.year);
    assert.equal(data.totalEmissions, inventory.totalEmissions);
  });

  it("should download an inventory in csv format", async () => {
    const url = `http://localhost:3000/api/v0/inventory/${inventory.inventoryId}?format=csv`;
    const req = createRequest(url);
    const res = await findInventory(req, {
      params: { inventory: inventory.inventoryId },
    });
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("content-type"), "text/csv");
    assert.ok(res.headers.get("content-disposition")?.startsWith("attachment"));
    const csv = await res.text();
    const lines = csv.split("\n");
    assert.ok(lines.length > 0);
    const headers = lines[0].split(",");
    assert.equal(headers.length, 7);
    assert.deepEqual(headers, [
      "Inventory Reference",
      "GPC Reference Number",
      "Total Emissions",
      "Activity Units",
      "Activity Value",
      "Emission Factor Value",
      "Datasource ID",
    ]);
    assert.ok(lines.length > 1, csv);
    assert.strictEqual(lines.length, 2);
    assert.ok(lines.slice(1).every((line) => line.split(",").length == 6));
  });

  it("should download an inventory in xls format", async () => {
    const url = `http://localhost:3000/api/v0/inventory/${inventory.inventoryId}?format=xls`;
    const req = createRequest(url);
    const res = await findInventory(req, {
      params: { inventory: inventory.inventoryId },
    });
    assert.equal(res.status, 200);
    assert.equal(res.headers.get("content-type"), "application/vnd.ms-excel");
    assert.ok(res.headers.get("content-disposition")?.startsWith("attachment"));
    const body = await res.blob();
  });

  it("should not find non-existing inventories", async () => {
    const req = mockRequest(invalidInventory);
    const res = await findInventory(req, {
      params: { inventory: randomUUID() },
    });
    assert.equal(res.status, 404);
  });

  it("should update an inventory", async () => {
    const req = mockRequest(inventoryData2);
    const res = await updateInventory(req, {
      params: { inventory: inventory.inventoryId },
    });
    assert.equal(res.status, 200);
    const { data } = await res.json();
    assert.equal(data.inventoryName, inventoryData2.inventoryName);
    assert.equal(data.year, inventoryData2.year);
    assert.equal(data.totalEmissions, inventoryData2.totalEmissions);
  });

  it("should not update an inventory with invalid data", async () => {
    const req = mockRequest(invalidInventory);
    const res = await updateInventory(req, {
      params: { inventory: inventory.inventoryId },
    });
    assert.equal(res.status, 400);
    const {
      error: { issues },
    } = await res.json();
    assert.equal(issues.length, 3);
  });

  it("should delete an inventory", async () => {
    const req = mockRequest();
    const res = await deleteInventory(req, {
      params: { inventory: inventory.inventoryId },
    });
    assert.equal(res.status, 200);
    const { data, deleted } = await res.json();
    assert.equal(deleted, true);
    assert.equal(data.inventoryName, inventory.inventoryName);
    assert.equal(data.year, inventory.year);
    assert.equal(data.totalEmissions, inventory.totalEmissions);
  });

  it("should not delete a non-existing inventory", async () => {
    const req = mockRequest();
    const res = await deleteInventory(req, {
      params: { inventory: randomUUID() },
    });
    assert.equal(res.status, 404);
  });

  it("should calculate progress for an inventory", async () => {
    // setup mock data
    const existingInventory = await db.models.Inventory.findOne({
      where: { inventoryName },
    });
    assert.notEqual(existingInventory, null);
    const sectorNames = ["PROGRESS_TEST1", "PROGRESS_TEST2", "PROGRESS_TEST3"];
    const userSource = await db.models.DataSource.create({
      datasourceId: randomUUID(),
      sourceType: "user",
      datasetName: "XX_INVENTORY_TEST_USER",
    });
    const thirdPartySource = await db.models.DataSource.create({
      datasourceId: randomUUID(),
      sourceType: "third_party",
      datasetName: "XX_INVENTORY_TEST_THIRD_PARTY",
    });
    const sources = [userSource, thirdPartySource, null];

    for (const sectorName of sectorNames) {
      const sectorId = randomUUID();
      await db.models.Sector.create({
        sectorId,
        sectorName: "XX_INVENTORY_" + sectorName,
      });
      for (let i = 0; i < sectorNames.length; i++) {
        const subSectorId = randomUUID();
        await db.models.SubSector.create({
          subsectorId: subSectorId,
          sectorId,
          subsectorName: "XX_INVENTORY_" + sectorName + "_" + sectorNames[i],
        });
        for (let j = 0; j < sectorNames.length; j++) {
          const subCategoryId = randomUUID();
          await db.models.SubCategory.create({
            subcategoryId: subCategoryId,
            subsectorId: subSectorId,
            subcategoryName: `XX_INVENTORY_${sectorName}_${sectorNames[i]}_${sectorNames[j]}`,
          });
          if (sources[i] != null) {
            await db.models.InventoryValue.create({
              id: randomUUID(),
              sectorId,
              subSectorId,
              subCategoryId,
              datasourceId: sources[i]?.datasourceId,
              inventoryId: existingInventory!.inventoryId,
            });
          }
        }
      }
    }

    const req = mockRequest();
    const res = await calculateProgress(req, {
      params: { inventory: inventory.inventoryId },
    });

    assert.equal(res.status, 200);
    const { totalProgress, sectorProgress } = (await res.json()).data;
    const cleanedSectorProgress = sectorProgress
      .filter(({ sector: checkSector }: { sector: { sectorName: string } }) => {
        return checkSector.sectorName.startsWith("XX_INVENTORY_PROGRESS_TEST");
      })
      .map(
        ({
          sector,
          subSectors,
          ...progress
        }: {
          sector: { sectorName: string; sectorId: string; completed: boolean };
          subSectors: Array<SubSectorAttributes & { completed: boolean }>;
        }) => {
          assert.notEqual(sector.sectorId, null);
          assert.equal(subSectors.length, 3, sector.sectorName);
          for (const subSector of subSectors) {
            assert.notEqual(subSector.completed, null);
          }
          return { sector: { sectorName: sector.sectorName }, ...progress };
        },
      );
    assert.equal(cleanedSectorProgress.length, 3);
    for (const sector of cleanedSectorProgress) {
      assert.equal(sector.total, 9);
      assert.equal(sector.thirdParty, 3);
      assert.equal(sector.uploaded, 3);
      assert.ok(
        sector.sector.sectorName.startsWith("XX_INVENTORY_PROGRESS_TEST"),
        "Wrong sector name: " + sector.sector.sectorName,
      );
    }
    assert.equal(totalProgress.thirdParty, 9);
    assert.equal(totalProgress.uploaded, 9);
    // TODO the route counts subsectors created by other tests/ seeders
    // assert.equal(totalProgress.total, 27);
  });

  it("should submit an inventory to the CDP test API", async () => {
    const req = mockRequest({});
    const res = await submitInventory(req, {
      params: { inventory: inventory.inventoryId },
    });
    assert.equal(res.status, 200);
    const json = await res.json();
    console.dir(json)
    assert.equal(json.success, true);
  })
});
