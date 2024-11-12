import {
  DELETE as deleteInventory,
  GET as findInventory,
  PATCH as updateInventory,
} from "@/app/api/v0/inventory/[inventory]/route";
import { GET as calculateProgress } from "@/app/api/v0/inventory/[inventory]/progress/route";
import { POST as createInventory } from "@/app/api/v0/city/[city]/inventory/route";
import { POST as submitInventory } from "@/app/api/v0/inventory/[inventory]/cdp/route";
import { db } from "@/models";
import { CreateInventoryRequest } from "@/util/validation";
import { randomUUID } from "node:crypto";
import { literal, Op } from "sequelize";
import {
  cascadeDeleteDataSource,
  createRequest,
  expectStatusCode,
  expectToBeLooselyEqual,
  mockRequest,
  setupTests,
  testUserID,
} from "../helpers";
import { SubSector, SubSectorAttributes } from "@/models/SubSector";
import { City } from "@/models/City";
import { Inventory } from "@/models/Inventory";
import { Sector } from "@/models/Sector";
import { SubCategory } from "@/models/SubCategory";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";
import { activityValues } from "./results.data";
import {
  GlobalWarmingPotentialTypeEnum,
  InventoryTypeEnum,
} from "@/util/enums";

jest.useFakeTimers();

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
  globalWarmingPotentialType: "ar4",
  inventoryType: "gpc_premium",
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

  beforeAll(async () => {
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
    const inventoryValueDb = await db.models.InventoryValue.create({
      id: randomUUID(),
      inventoryId: inventory.inventoryId,
      subCategoryId: subCategory.subcategoryId,
      ...inventoryValue,
    });

    await db.models.ActivityValue.bulkCreate(
      activityValues.map((i) => ({
        ...i,
        inventoryValueId: inventoryValueDb.id,
        inventoryId: inventory.inventoryId,
        id: randomUUID(),
      })),
    );
    await db.models.Population.upsert({
      cityId: city.cityId!,
      year: inventoryData.year,
      population: 1000,
      countryPopulation: 10000,
      regionPopulation: 5000,
    });
  });

  afterAll(async () => {
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
    await db.models.Population.create({
      cityId: city.cityId!,
      year: 2020,
      population: 1000,
    });
    await expectStatusCode(res, 200);
    const { data } = await res.json();
    expect(data.inventoryName).toEqual(inventory.inventoryName);
    expect(data.year).toEqual(inventory.year);
    expect(data.totalEmissions).toEqual(inventory.totalEmissions);
  });

  it("should not create an inventory with invalid data", async () => {
    const req = mockRequest(invalidInventory);
    const res = await createInventory(req, {
      params: { city: locode },
    });
    expect(res.status).toEqual(400);
    const {
      error: { issues },
    } = await res.json();
    expect(issues.length).toEqual(5);
  });

  it("should find an inventory", async () => {
    const req = mockRequest();
    const res = await findInventory(req, {
      params: { inventory: inventory.inventoryId },
    });
    expect(res.status).toEqual(200);
    const { data } = await res.json();
    expect(data.inventoryName).toEqual(inventory.inventoryName);
    expect(data.year).toEqual(inventory.year);
    const totalSumOfActivityValues = 79735;
    expectToBeLooselyEqual(data.totalEmissions, totalSumOfActivityValues);
  });

  it.skip("should download an inventory in csv format", async () => {
    const url = `http://localhost:3000/api/v0/inventory/${inventory.inventoryId}?format=csv`;
    const req = createRequest(url);
    const res = await findInventory(req, {
      params: { inventory: inventory.inventoryId },
    });
    expect(res.status).toEqual(200);
    expect(res.headers.get("content-type")).toEqual("text/csv");
    expect(
      res.headers.get("content-disposition")?.startsWith("attachment"),
    ).toBeTruthy();
    const csv = await res.text();
    const lines = csv.split("\n");
    expect(lines.length > 0).toBeTruthy();
    const headers = lines[0].split(",");
    expect(headers.length).toEqual(7);
    expect(headers).toEqual([
      "Inventory Reference",
      "GPC Reference Number",
      "Total Emissions",
      "Activity Units",
      "Activity Value",
      "Emission Factor Value",
      "Datasource ID",
    ]);
    expect(lines.length > 1).toBeTruthy();
    expect(lines.length).toStrictEqual(2);
    expect(
      lines.slice(1).every((line) => line.split(",").length == 6),
    ).toBeTruthy();
  });

  // TODO this test is very slow. use "CIRIS Light" spreadsheet instead (for download as well anyways)
  it.skip("should download an inventory in xls format", async () => {
    const url = `http://localhost:3000/api/v0/inventory/${inventory.inventoryId}?format=xls`;
    const req = createRequest(url);
    const res = await findInventory(req, {
      params: { inventory: inventory.inventoryId },
    });
    expect(res.status).toEqual(200);
    expect(res.headers.get("content-type")).toEqual("application/vnd.ms-excel");
    expect(
      res.headers.get("content-disposition")?.startsWith("attachment"),
    ).toBeTruthy();
    const body = await res.blob();
  });

  it("should not find non-existing inventories", async () => {
    const req = mockRequest(invalidInventory);
    const res = await findInventory(req, {
      params: { inventory: randomUUID() },
    });
    expect(res.status).toEqual(404);
  });

  it("should update an inventory", async () => {
    const req = mockRequest(inventoryData2);
    const res = await updateInventory(req, {
      params: { inventory: inventory.inventoryId },
    });
    expect(res.status).toEqual(200);
    const { data } = await res.json();
    expect(data.inventoryName).toEqual(inventoryData2.inventoryName);
    expect(data.year).toEqual(inventoryData2.year);
    expect(data.totalEmissions).toEqual(inventoryData2.totalEmissions);
  });

  it("should not update an inventory with invalid data", async () => {
    const req = mockRequest(invalidInventory);
    const res = await updateInventory(req, {
      params: { inventory: inventory.inventoryId },
    });
    expect(res.status).toEqual(400);
    const {
      error: { issues },
    } = await res.json();
    expect(issues.length).toEqual(1);
  });

  it("should delete an inventory", async () => {
    const req = mockRequest();
    const res = await deleteInventory(req, {
      params: { inventory: inventory.inventoryId },
    });
    expect(res.status).toEqual(200);
    const { data, deleted } = await res.json();
    expect(deleted).toEqual(true);
    expect(data.inventoryName).toEqual(inventory.inventoryName);
    expect(data.year).toEqual(inventory.year);
    expect(data.totalEmissions).toEqual(inventory.totalEmissions);
  });

  it("should not delete a non-existing inventory", async () => {
    const req = mockRequest();
    const res = await deleteInventory(req, {
      params: { inventory: randomUUID() },
    });
    expect(res.status).toEqual(404);
  });

  // TODO these tests need to be redone.
  it.skip("should calculate progress for an inventory", async () => {
    // setup mock data
    const existingInventory = await db.models.Inventory.findOne({
      where: { inventoryName },
    });
    expect(existingInventory).not.toEqual(null);
    const sectorNames = ["PROGRESS_TEST1", "PROGRESS_TEST2", "PROGRESS_TEST3"];
    const userSource = await db.models.DataSource.create({
      datasourceId: randomUUID(),
      sourceType: "user",
      datasetName: {
        en: "XX_INVENTORY_TEST_USE",
      },
    });
    const thirdPartySource = await db.models.DataSource.create({
      datasourceId: randomUUID(),
      sourceType: "third_party",
      datasetName: { en: "XX_INVENTORY_TEST_THIRD_PARTY" },
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

    expect(res.status).toEqual(200);
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
          expect(sector.sectorId).not.toEqual(null);
          expect(subSectors.length).toEqual(3);
          for (const subSector of subSectors) {
            expect(subSector.completed).not.toEqual(null);
          }
          return { sector: { sectorName: sector.sectorName }, ...progress };
        },
      );
    expect(cleanedSectorProgress.length).toEqual(3);
    for (const sector of cleanedSectorProgress) {
      expect(sector.total).toEqual(9);
      expect(sector.thirdParty).toEqual(3);
      expect(sector.uploaded).toEqual(3);
      expect(
        sector.sector.sectorName.startsWith("XX_INVENTORY_PROGRESS_TEST"),
      ).toBeTruthy();
    }
    expect(totalProgress.thirdParty).toEqual(9);
    expect(totalProgress.uploaded).toEqual(9);
    // TODO the route counts subsectors created by other tests/ seeders
    // expect(totalProgress.total).toEqual(27);
  });

  it.skip("should submit an inventory to the CDP test API", async () => {
    const req = mockRequest({});
    const res = await submitInventory(req, {
      params: { inventory: inventory.inventoryId },
    });
    await expectStatusCode(res, 200);
    const json = await res.json();
    expect(json.success).toBe(true);
  });
});
