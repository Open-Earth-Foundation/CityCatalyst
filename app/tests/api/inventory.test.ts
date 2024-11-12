import { GET as findInventory } from "@/app/api/v0/inventory/[inventory]/download/route";
import { POST as submitInventory } from "@/app/api/v0/inventory/[inventory]/cdp/route";
import { db } from "@/models";
import { CreateInventoryRequest } from "@/util/validation";
import assert from "node:assert";
import { randomUUID } from "node:crypto";
import { after, before, beforeEach, describe, it } from "node:test";
import { literal, Op } from "sequelize";
import {
  cascadeDeleteDataSource,
  createRequest,
  mockRequest,
  setupTests,
  testUserID,
} from "../helpers";
import { SubSector } from "@/models/SubSector";
import { City } from "@/models/City";
import { Inventory } from "@/models/Inventory";
import { Sector } from "@/models/Sector";
import { SubCategory } from "@/models/SubCategory";
import {
  GlobalWarmingPotentialTypeEnum,
  InventoryTypeEnum,
} from "@/util/enums";

const locode = "XX_INVENTORY_CITY";
// Matches name given by CDP for API testing
const cityName = "Open Earth Foundation API City Discloser";
const cityCountry = "United Kingdom of Great Britain and Northern Ireland";
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
  globalWarmingPotentialType: GlobalWarmingPotentialTypeEnum.ar6,
  inventoryType: InventoryTypeEnum.GPC_BASIC,
};

const inventoryData2: CreateInventoryRequest = {
  inventoryName,
  year: 3001,
  totalEmissions: 1338,
  globalWarmingPotentialType: GlobalWarmingPotentialTypeEnum.ar6,
  inventoryType: InventoryTypeEnum.GPC_BASIC,
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

    await cascadeDeleteDataSource({
      [Op.or]: [literal(`dataset_name ->> 'en' LIKE 'XX_INVENTORY_TEST_%'`)],
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
    city = await db.models.City.create({
      cityId: randomUUID(),
      name: cityName,
      country: cityCountry,
      locode,
    });
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
      inventoryType: InventoryTypeEnum.GPC_BASIC,
      globalWarmingPotentialType: GlobalWarmingPotentialTypeEnum.ar6,
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

  it.skip("should download an inventory in csv format", async () => {
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

  // TODO this test is very slow. use "CIRIS Light" spreadsheet instead (for download as well anyways)
  it.skip("should download an inventory in xls format", async () => {
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

  it(
    "should submit an inventory to the CDP test API",
    { skip: true },
    async () => {
      const req = mockRequest({});
      const res = await submitInventory(req, {
        params: { inventory: inventory.inventoryId },
      });
      assert.equal(res.status, 200);
      const json = await res.json();
      assert.equal(json.success, true);
    },
  );
});
