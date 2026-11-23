import { GET as getDataSourcesForSector } from "@/app/api/v1/datasource/[inventoryId]/[sectorId]/route";
import { GET as getAllDataSources } from "@/app/api/v1/datasource/[inventoryId]/route";
import { DELETE as deleteInventoryValue } from "@/app/api/v1/datasource/[inventoryId]/datasource/[datasourceId]/route";
import { GET as getSingleDataSource } from "@/app/api/v1/datasource/[inventoryId]/datasource/[datasourceId]/route";
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
import {
  createTestData,
  cleanupTestData,
  TestData,
} from "../helpers/testDataCreationHelper";
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
import { Roles } from "@/util/types";

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
  user: { id: testUserID, role: Roles.User },
  expires: "1h",
};
const unrelatedSession: AppSession = {
  user: { id: randomUUID(), role: Roles.User },
  expires: "1h",
};
let currentSession: AppSession | null = mockSession;

const apiEndpoint =
  "http://localhost:4000/api/v1/climatetrace/city/:locode/:year/:gpcReferenceNumber";

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

async function cleanupDatabase() {
  await db.models.Inventory.destroy({ where: { year: inventoryData.year } });
  await cascadeDeleteDataSource({
    [Op.or]: [literal(`dataset_name ->> 'en' LIKE 'XX_INVENTORY_TEST_%'`)],
  });
  await db.models.SubCategory.destroy({ where: { subcategoryName } });
  await db.models.SubSector.destroy({ where: { subsectorName } });
  await db.models.Sector.destroy({ where: { sectorName } });
}

describe("DataSource API", () => {
  let city: City;
  let inventory: Inventory;
  let sector: Sector;
  const prevGetServerSession = Auth.getServerSession;
  let testData: TestData;

  beforeAll(async () => {
    setupTests();
    Auth.getServerSession = jest.fn(() => Promise.resolve(currentSession));

    await db.initialize();
    await cleanupDatabase();

    // Create proper test data hierarchy
    testData = await createTestData({
      cityName: locode,
      countryLocode: "XX",
    });

    city = (await db.models.City.findByPk(testData.cityId)) as City;
    if (!city) {
      throw new Error(`Failed to find city with ID ${testData.cityId}`);
    }

    // Update city with datasource test specific data
    await city.update({
      name: "CC_",
      locode: locode,
    });

    await db.models.User.upsert({ userId: testUserID, name: "TEST_USER" });
    await db.models.CityUser.create({
      cityUserId: randomUUID(),
      userId: testUserID,
      cityId: city.cityId,
    });

    inventory = await db.models.Inventory.create({
      ...inventoryData,
      inventoryId: randomUUID(),
      cityId: testData.cityId,
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

      // Update the datasource with the computed URL
      await source.update({ url });

      fetchMock.route(url, mockGlobalApiResponses[i]);
    }

    fetchMock.mockGlobal();
  });

  afterAll(async () => {
    await cleanupDatabase();
    await cleanupTestData(testData);
    Auth.getServerSession = prevGetServerSession;
    if (db.sequelize) await db.sequelize.close();
  });

  it("should get the data sources for a sector", async () => {
    const req = mockRequest();
    const res = await getDataSourcesForSector(req, {
      params: Promise.resolve({
        inventoryId: inventory.inventoryId,
        sectorId: sector.sectorId,
      }),
    });
    await expectStatusCode(res, 200);
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
      params: Promise.resolve({ inventoryId: inventory.inventoryId }),
    });
    await expectStatusCode(res, 200);
    const { data } = await res.json();
    expect(data.length).toBe(2);
  });

  it.todo("should apply data sources");

  it("should delete an inventory value", async () => {
    const datasource = await db.models.DataSource.findOne({
      // @ts-expect-error -- `url` is typed as `string | undefined`, not `string | null`, even though the DB column allows NULL
      where: {
        url: {
          [Op.ne]: null,
        },
      },
    });

    if (!datasource) throw new Error("Test setup failed: datasource not found");

    const { datasourceId } = datasource;
    const inventoryValueId = randomUUID();
    await db.models.InventoryValue.create({
      id: inventoryValueId,
      datasourceId,
      inventoryId: inventory.inventoryId,
    });
    const req = mockRequest();
    const res = await deleteInventoryValue(req, {
      params: Promise.resolve({
        inventoryId: inventory.inventoryId,
        datasourceId,
      }),
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
      params: Promise.resolve({
        inventoryId: randomUUID(),
        datasourceId: randomUUID(),
      }),
    });
    await expectStatusCode(res, 404);
  });

  it("should get a single datasource with scaling", async () => {
    // Use the first created datasource for the positive test
    const datasource = await db.models.DataSource.findOne({
      where: { sectorId: sector.sectorId },
    });
    if (!datasource) throw new Error("Test setup failed: datasource not found");
    const req = mockRequest();
    const res = await getSingleDataSource(req, {
      params: Promise.resolve({
        inventoryId: inventory.inventoryId,
        datasourceId: datasource.datasourceId,
      }),
    });
    await expectStatusCode(res, 200);
    const data = await res.json();
    expect(data.source.datasourceId).toBe(datasource.datasourceId);
    expect(data.data).toBeDefined();
    expect(data.data.scaleFactor).toBeDefined();
  });

  it("should return 404 if datasource not found", async () => {
    const req = mockRequest();
    const res = await getSingleDataSource(req, {
      params: Promise.resolve({
        inventoryId: inventory.inventoryId,
        datasourceId: randomUUID(),
      }),
    });
    await expectStatusCode(res, 404);
  });

  it("should return 404 if inventory not found", async () => {
    const datasource = await db.models.DataSource.findOne({
      where: { sectorId: sector.sectorId },
    });
    if (!datasource) throw new Error("Test setup failed: datasource not found");
    const req = mockRequest();
    const res = await getSingleDataSource(req, {
      params: Promise.resolve({
        inventoryId: randomUUID(),
        datasourceId: datasource.datasourceId,
      }),
    });
    await expectStatusCode(res, 404);
  });

  describe("inventory access control", () => {
    const privateValueId = randomUUID();
    const privateAmount = "7421000";
    const publicValueId = randomUUID();
    const publicAmount = "1234567";
    let publicInventory: Inventory;

    const getAll = (inventoryId: string) =>
      getAllDataSources(mockRequest(), {
        params: Promise.resolve({ inventoryId }),
      });
    const getForSector = (inventoryId: string) =>
      getDataSourcesForSector(mockRequest(), {
        params: Promise.resolve({ inventoryId, sectorId: sector.sectorId }),
      });

    beforeAll(async () => {
      const source = await db.models.DataSource.findOne({
        where: { sectorId: sector.sectorId, geographicalLocation: "EARTH" },
      });
      if (!source) throw new Error("Test setup failed: datasource not found");
      // registered user with no org, project or city membership
      await db.models.User.create({
        userId: unrelatedSession.user.id,
        name: "XX_DATASOURCE_OUTSIDER",
      });
      publicInventory = await db.models.Inventory.create({
        ...inventoryData,
        inventoryId: randomUUID(),
        cityId: testData.cityId,
        isPublic: true,
      });
      await db.models.InventoryValue.bulkCreate([
        {
          id: privateValueId,
          datasourceId: source.datasourceId,
          inventoryId: inventory.inventoryId,
          co2eq: BigInt(privateAmount),
        },
        {
          id: publicValueId,
          datasourceId: source.datasourceId,
          inventoryId: publicInventory.inventoryId,
          co2eq: BigInt(publicAmount),
        },
      ]);
    });

    afterAll(async () => {
      currentSession = mockSession;
      await db.models.InventoryValue.destroy({
        where: { id: [privateValueId, publicValueId] },
      });
      await publicInventory?.destroy();
      await db.models.User.destroy({
        where: { userId: unrelatedSession.user.id },
      });
    });

    it("returns the private source-linked value to an authorized member", async () => {
      currentSession = mockSession;
      const res = await getAll(inventory.inventoryId);
      await expectStatusCode(res, 200);
      const body = await res.text();
      expect(body).toContain(privateValueId);
      expect(body).toContain(privateAmount);
    });

    it.each([
      ["anonymous", null, 401],
      ["unrelated user", unrelatedSession, 403],
    ] as const)(
      "denies %s access to a private inventory",
      async (_label, session, status) => {
        currentSession = session;
        for (const res of [
          await getAll(inventory.inventoryId),
          await getForSector(inventory.inventoryId),
        ]) {
          await expectStatusCode(res, status);
          const body = await res.text();
          expect(body).not.toContain(privateValueId);
          expect(body).not.toContain(privateAmount);
        }
      },
    );

    it("lets anonymous callers read a public inventory without exposing private ones", async () => {
      currentSession = null;
      const res = await getAll(publicInventory.inventoryId);
      await expectStatusCode(res, 200);
      const body = await res.text();
      expect(body).toContain(publicValueId);
      expect(body).toContain(publicAmount);
      expect(body).not.toContain(privateValueId);
      expect(body).not.toContain(privateAmount);
      await expectStatusCode(
        await getForSector(publicInventory.inventoryId),
        200,
      );
      await expectStatusCode(await getAll(inventory.inventoryId), 401);
    });
  });
});
