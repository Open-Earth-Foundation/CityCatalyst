import { GET as getDataSourcesForSector } from "@/app/api/v0/datasource/[inventoryId]/[sectorId]/route";
import { GET as getAllDataSources } from "@/app/api/v0/datasource/[inventoryId]/route";
import { DELETE as deleteInventoryValue } from "@/app/api/v0/datasource/[inventoryId]/datasource/[datasourceId]/route";
import { db } from "@/models";
import { randomUUID } from "node:crypto";
import { literal, Op } from "sequelize";
import {
  cascadeDeleteDataSource,
  expectStatusCode,
  mockRequest,
  setupTests,
  testUserID,
} from "../helpers";
import { City } from "@/models/City";
import { CreateInventoryRequest } from "@/util/validation";
import { Sector } from "@/models/Sector";
import { Inventory } from "@/models/Inventory";
import fetchMock from "fetch-mock";
import { afterAll, beforeAll, describe, expect, it, jest } from "@jest/globals";
import {
  GlobalWarmingPotentialTypeEnum,
  InventoryTypeEnum,
} from "@/util/enums";
import { AppSession, Auth } from "@/lib/auth";

const locode = "XX_DATASOURCE_CITY";
const sectorName = "XX_DATASOURCE_TEST_1";
const subsectorName = "XX_DATASOURCE_TEST_1";
const subcategoryName = "XX_DATASOURCE_TEST_1";

const inventoryData: CreateInventoryRequest = {
  inventoryName: "Test Inventory",
  year: 4000,
  totalEmissions: 1337,
  globalWarmingPotentialType: GlobalWarmingPotentialTypeEnum.ar6,
  inventoryType: InventoryTypeEnum.GPC_BASIC,
};

const sourceLocations = [
  "EARTH",
  "DE,US,XX",
  "DE_BLN,US_NY,XX_DATASOURCE_CITY",
];

const mockSession: AppSession = {
  user: { id: testUserID, role: "user" },
  expires: "1h",
};

const apiEndpoint =
  "http://localhost:4000/api/v0/climatetrace/city/:locode/:year/:gpcReferenceNumber";

const mockGlobalApiResponses = [
  {
    totals: {
      emissions: { co2_co2eq: 1337, ch4_co2eq: 1338, n2o_co2eq: 1339 },
    },
  },
  {
    totals: {
      emissions: { co2_co2eq: 2337, ch4_co2eq: 2338, n2o_co2eq: 2339 },
    },
  },
  {
    totals: {
      emissions: { co2_co2eq: 3337, ch4_co2eq: 3338, n2o_co2eq: 3339 },
    },
  },
];

describe("DataSource API", () => {
  let city: City;
  let inventory: Inventory;
  let sector: Sector;
  let prevGetServerSession = Auth.getServerSession;

  beforeAll(async () => {
    setupTests();
    Auth.getServerSession = jest.fn(() => Promise.resolve(mockSession));

    await db.initialize();

    await db.models.Inventory.destroy({ where: { year: inventoryData.year } });
    await cascadeDeleteDataSource({
      [Op.or]: [literal(`dataset_name ->> 'en' LIKE 'XX_INVENTORY_TEST_%'`)],
    });
    await db.models.City.destroy({ where: { locode } });
    city = await db.models.City.create({
      cityId: randomUUID(),
      locode,
      name: "CC_",
    });
    await db.models.CityUser.create({
      cityUserId: randomUUID(),
      userId: testUserID,
      cityId: city.cityId,
    });
    await db.models.SubCategory.destroy({ where: { subcategoryName } });
    await db.models.SubSector.destroy({ where: { subsectorName } });
    await db.models.Sector.destroy({ where: { sectorName } });

    inventory = await db.models.Inventory.create({
      ...inventoryData,
      inventoryId: randomUUID(),
      cityId: city.cityId,
    });

    sector = await db.models.Sector.create({
      sectorId: randomUUID(),
      referenceNumber: "X",
      sectorName,
    });

    const subSector = await db.models.SubSector.create({
      subsectorId: randomUUID(),
      sectorId: sector.sectorId,
      referenceNumber: "X.9",
      subsectorName,
    });

    const subCategory = await db.models.SubCategory.create({
      subcategoryId: randomUUID(),
      subsectorId: subSector.subsectorId,
      referenceNumber: "X.9.9",
      subcategoryName,
    });

    fetchMock.config.overwriteRoutes = true;
    for (let i = 0; i < 3; i++) {
      const source = await db.models.DataSource.create({
        datasourceId: randomUUID(),
        datasetName: { en: "XX_DATASOURCE_TEST_" + i },
        sectorId: sector.sectorId,
        apiEndpoint,
        startYear: 4000 + i,
        endYear: 4010 + i,
        geographicalLocation: sourceLocations[i],
        subcategoryId: subCategory.subcategoryId,
      });
      const url = source
        .apiEndpoint!.replace(":locode", locode)
        .replace(":year", inventory.year!.toString())
        .replace(":gpcReferenceNumber", subCategory.referenceNumber!);
      fetchMock.mock(url, mockGlobalApiResponses[i]);
    }
  });

  afterAll(async () => {
    Auth.getServerSession = prevGetServerSession;
    if (db.sequelize) await db.sequelize.close();
  });

  it("should get the data sources for a sector", async () => {
    const req = mockRequest();
    const res = await getDataSourcesForSector(req, {
      params: { inventoryId: inventory.inventoryId, sectorId: sector.sectorId },
    });
    expect(res.status).toBe(200);
    const { data } = await res.json();
    expect(data.length).toBe(1);
    const { source } = data[0];
    expect(source.datasetName.en).toBe("XX_DATASOURCE_TEST_0");
    expect(source.sectorId).toBe(sector.sectorId);
    expect(source.apiEndpoint).toBe(apiEndpoint);
    expect(source.geographicalLocation).toBe("EARTH");
    expect(source.startYear).toBe(4000);
    expect(source.endYear).toBe(4010);
  });

  it("should get the data sources for all sectors", async () => {
    const req = mockRequest();
    const res = await getAllDataSources(req, {
      params: { inventoryId: inventory.inventoryId },
    });
    expect(res.status).toBe(200);
    const { data } = await res.json();
    expect(data.length).toBe(2);
  });

  it.todo("should apply data sources");

  it("should delete an inventory value", async () => {
    const datasource = await db.models.DataSource.findOne({
      // @ts-ignore
      where: {
        url: {
          [Op.ne]: null,
        },
      },
    });

    const { datasourceId } = datasource;
    const inventoryValueId = randomUUID();
    await db.models.InventoryValue.create({
      id: inventoryValueId,
      datasourceId,
      inventoryId: inventory.inventoryId,
    });
    const req = mockRequest();
    const res = await deleteInventoryValue(req, {
      params: {
        inventoryId: inventory.inventoryId,
        datasourceId,
      },
    });
    await expectStatusCode(res, 200);
    const { deleted } = await res.json();
    expect(deleted).toEqual(true);
    const deletedInventoryValue = await db.models.InventoryValue.findOne({
      where: { id: inventoryValueId },
    });
    expect(deletedInventoryValue).toBeNull();
  });

  it("should not delete a non-existing inventory value", async () => {
    const req = mockRequest();
    const res = await deleteInventoryValue(req, {
      params: {
        inventoryId: randomUUID(),
        datasourceId: randomUUID(),
      },
    });
    await expectStatusCode(res, 404);
  });
});
