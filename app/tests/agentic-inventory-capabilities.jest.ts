import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";
import createHttpError from "http-errors";
import { randomUUID } from "node:crypto";
import { Op } from "sequelize";

import { POST as emissionsContextRoute } from "@/app/api/v1/internal/ca/capabilities/ghgi/inventory/emissions-context/route";
import { POST as listAccessibleRoute } from "@/app/api/v1/internal/ca/capabilities/ghgi/inventory/list-accessible/route";
import { POST as statusOverviewRoute } from "@/app/api/v1/internal/ca/capabilities/ghgi/inventory/status-overview/route";
import {
  INVENTORY_EMISSIONS_CONTEXT_CAPABILITY,
  INVENTORY_LIST_ACCESSIBLE_CAPABILITY,
  INVENTORY_STATUS_OVERVIEW_CAPABILITY,
} from "@/backend/agentic/ghgi/inventory/registry";
import { PermissionService } from "@/backend/permissions/PermissionService";
import { db } from "@/models";
import { City } from "@/models/City";
import { DataSourceI18n } from "@/models/DataSourceI18n";
import { Inventory } from "@/models/Inventory";
import {
  GlobalWarmingPotentialTypeEnum,
  InventoryTypeEnum,
} from "@/util/enums";
import {
  expectStatusCode,
  mockRequest,
  setupTests,
  testUserID,
} from "./helpers";
import {
  baseInventory,
  inventoryId,
  inventoryValueId,
  inventoryValueId1,
  inventoryValueId2,
  inventoryValueId3,
  inventoryValues as inventoryValuesData,
} from "./api/results.data";
import {
  cleanupTestData,
  createTestData,
  TestData,
} from "./helpers/testDataCreationHelper";

const serviceKey = "test-cc-service-key";
const notEstimatedValueId = "58830000-0000-4000-8000-000000000501";
const priorYearInventoryId = "58830000-0000-4000-8000-000000000502";
const projectAdminOnlyCityId = "58830000-0000-4000-8000-000000000503";
const projectAdminOnlyInventoryId = "58830000-0000-4000-8000-000000000504";
const projectAdminId = "58830000-0000-4000-8000-000000000505";

const serviceHeaders = {
  "X-Service-Name": "climate-advisor",
  "X-Service-Key": serviceKey,
};

describe("GHGI inventory internal CA capability routes", () => {
  let testData: TestData;
  let city: City;
  let inventory: Inventory;
  let priorYearInventory: Inventory;
  let projectAdminOnlyCity: City;
  let projectAdminOnlyInventory: Inventory;
  let thirdPartySource: DataSourceI18n;
  let siblingProjectId = "";
  let siblingProjectCityId = "";
  let siblingProjectInventoryId = "";

  beforeAll(async () => {
    setupTests();
    await db.initialize();
    testData = await createTestData({
      cityName: "Agentic Inventory City",
      countryLocode: "US",
    });
    city = (await db.models.City.findByPk(testData.cityId)) as City;
    await city.update({
      name: "New York",
      country: "United States of America",
      locode: `US AIC ${randomUUID().slice(0, 8)}`,
    });
    await db.models.User.upsert({ userId: testUserID, name: "TEST_USER" });
    await city.addUser(testUserID);

    thirdPartySource = await db.models.DataSource.create({
      datasourceId: randomUUID(),
      datasourceName: "Agentic inventory route test source",
      datasetName: { en: "Agentic inventory route test source" },
      sourceType: "third_party",
      geographicalLocation: "US",
      startYear: 2024,
      endYear: 2024,
      latestAccountingYear: 2024,
    });

    inventory = await db.models.Inventory.create({
      inventoryId,
      ...baseInventory,
      inventoryName: "AgenticInventoryCapabilityTestInventory",
      cityId: city.cityId,
      inventoryType: InventoryTypeEnum.GPC_BASIC,
      globalWarmingPotentialType: GlobalWarmingPotentialTypeEnum.ar6,
      year: 2024,
    });
    priorYearInventory = await db.models.Inventory.create({
      inventoryId: priorYearInventoryId,
      ...baseInventory,
      inventoryName: "AgenticInventoryCapabilityTestInventory2023",
      cityId: city.cityId,
      inventoryType: InventoryTypeEnum.GPC_BASIC,
      globalWarmingPotentialType: GlobalWarmingPotentialTypeEnum.ar6,
      year: 2023,
    });
    projectAdminOnlyCity = await db.models.City.create({
      cityId: projectAdminOnlyCityId,
      name: "Project Admin Only City",
      country: "United States of America",
      locode: `US PAO ${randomUUID().slice(0, 8)}`,
      projectId: testData.projectId,
    });
    projectAdminOnlyInventory = await db.models.Inventory.create({
      inventoryId: projectAdminOnlyInventoryId,
      ...baseInventory,
      inventoryName: "ProjectAdminOnlyInventory",
      cityId: projectAdminOnlyCity.cityId,
      inventoryType: InventoryTypeEnum.GPC_BASIC,
      globalWarmingPotentialType: GlobalWarmingPotentialTypeEnum.ar6,
      year: 2024,
    });
    await db.models.ProjectAdmin.create({
      projectAdminId,
      projectId: testData.projectId,
      userId: testUserID,
    });
    siblingProjectId = randomUUID();
    siblingProjectCityId = randomUUID();
    siblingProjectInventoryId = randomUUID();
    await db.models.Project.create({
      projectId: siblingProjectId,
      name: "Sibling Project",
      description: "Sibling project for project-admin scope regression",
      organizationId: testData.organizationId,
      cityCountLimit: 10,
    });
    await db.models.City.create({
      cityId: siblingProjectCityId,
      name: "Sibling Project City",
      country: "United States of America",
      locode: `US SPC ${randomUUID().slice(0, 8)}`,
      projectId: siblingProjectId,
    });
    await db.models.Inventory.create({
      inventoryId: siblingProjectInventoryId,
      ...baseInventory,
      inventoryName: "SiblingProjectInventory",
      cityId: siblingProjectCityId,
      inventoryType: InventoryTypeEnum.GPC_BASIC,
      globalWarmingPotentialType: GlobalWarmingPotentialTypeEnum.ar6,
      year: 2024,
    });

    await db.models.InventoryValue.bulkCreate(
      inventoryValuesData.map((value, index) => ({
        ...value,
        co2eq: value.co2eq == null ? value.co2eq : value.co2eq * 1000n,
        datasourceId: index === 0 ? thirdPartySource.datasourceId : null,
      })),
    );
    await createNotEstimatedValue(inventory.inventoryId);
  });

  beforeEach(() => {
    setupTests();
    process.env.CC_SERVICE_API_KEY = serviceKey;
    process.env.NEXT_PUBLIC_FEATURE_FLAGS = "CA_SERVICE_INTEGRATION";
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  afterAll(async () => {
    await db.models.ActivityValue.destroy({
      where: {
        inventoryValueId: {
          [Op.in]: [
            inventoryValueId,
            inventoryValueId1,
            inventoryValueId2,
            inventoryValueId3,
            notEstimatedValueId,
          ],
        },
      },
    });
    await db.models.InventoryValue.destroy({ where: { inventoryId } });
    await db.models.Inventory.destroy({
      where: { inventoryId: { [Op.in]: [inventoryId, priorYearInventoryId] } },
    });
    await db.models.Inventory.destroy({
      where: { inventoryId: projectAdminOnlyInventoryId },
    });
    await db.models.ProjectAdmin.destroy({ where: { projectAdminId } });
    await db.models.City.destroy({ where: { cityId: projectAdminOnlyCityId } });
    await db.models.Inventory.destroy({
      where: { inventoryId: siblingProjectInventoryId },
    });
    await db.models.City.destroy({ where: { cityId: siblingProjectCityId } });
    await db.models.Project.destroy({ where: { projectId: siblingProjectId } });
    if (thirdPartySource) {
      await db.models.DataSource.destroy({
        where: { datasourceId: thirdPartySource.datasourceId },
      });
    }
    await cleanupTestData(testData);
    if (db.sequelize) {
      await db.sequelize.close();
    }
  });

  it("lists accessible inventories with no filters", async () => {
    const res = await listAccessibleRoute(listAccessibleRequest(), {
      params: Promise.resolve({}),
    });

    await expectStatusCode(res, 200);
    const payload = await res.json();

    expect(payload.action).toBe(INVENTORY_LIST_ACCESSIBLE_CAPABILITY);
    expect(payload.success).toBe(true);
    expect(payload.data.access_scope).toBe("projects");
    expect(payload.data.total_cities).toBeGreaterThanOrEqual(1);
    expect(payload.data.total_inventories).toBeGreaterThanOrEqual(2);
    expect(payload.data.by_project).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          organization_id: testData.organizationId,
          organization_name: "Test Organization",
          project_id: testData.projectId,
          project_name: "Test Project",
          total_cities: expect.any(Number),
          total_inventories: expect.any(Number),
        }),
      ]),
    );
    expect(payload.data.cities).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          city_id: city.cityId,
          name: "New York",
          country: "United States of America",
          project_id: testData.projectId,
          project_name: "Test Project",
          organization_id: testData.organizationId,
          organization_name: "Test Organization",
          inventories: expect.arrayContaining([
            expect.objectContaining({
              inventory_id: inventory.inventoryId,
              year: 2024,
              updated_at: expect.any(String),
            }),
            expect.objectContaining({
              inventory_id: priorYearInventory.inventoryId,
              year: 2023,
            }),
          ]),
        }),
      ]),
    );
  });

  it("includes organization/project breakdown for project-admin cities", async () => {
    const res = await listAccessibleRoute(listAccessibleRequest(), {
      params: Promise.resolve({}),
    });

    await expectStatusCode(res, 200);
    const payload = await res.json();
    const matchingCity = payload.data.cities.find(
      (candidate: { city_id: string }) =>
        candidate.city_id === projectAdminOnlyCity.cityId,
    );
    const projectBreakdown = payload.data.by_project.find(
      (entry: { project_id: string | null }) =>
        entry.project_id === testData.projectId,
    );

    expect(matchingCity).toEqual(
      expect.objectContaining({
        city_id: projectAdminOnlyCity.cityId,
        project_id: testData.projectId,
        project_name: "Test Project",
        organization_id: testData.organizationId,
        organization_name: "Test Organization",
      }),
    );
    expect(projectBreakdown).toEqual(
      expect.objectContaining({
        project_id: testData.projectId,
        organization_id: testData.organizationId,
        total_cities: expect.any(Number),
        total_inventories: expect.any(Number),
      }),
    );
    expect(projectBreakdown.total_cities).toBeGreaterThanOrEqual(2);
    expect(projectBreakdown.total_inventories).toBeGreaterThanOrEqual(3);
  });

  it("treats null list filters as omitted filters", async () => {
    const res = await listAccessibleRoute(
      listAccessibleRequest({
        city_query: null,
        year: null,
        include_all_city_years: false,
      }),
      { params: Promise.resolve({}) },
    );

    await expectStatusCode(res, 200);
    const payload = await res.json();

    expect(payload.data.total_cities).toBeGreaterThanOrEqual(1);
    expect(payload.data.filters).toEqual({
      city_id: null,
      city_query: null,
      year: null,
      include_all_city_years: false,
    });
  });

  it("filters inventories by exact city id", async () => {
    const res = await listAccessibleRoute(
      listAccessibleRequest({
        city_id: city.cityId,
        include_all_city_years: true,
      }),
      { params: Promise.resolve({}) },
    );

    await expectStatusCode(res, 200);
    const payload = await res.json();

    expect(payload.data.cities).toHaveLength(1);
    expect(payload.data.cities[0].city_id).toBe(city.cityId);
    expect(payload.data.filters.city_id).toBe(city.cityId);
  });

  it("lists project-admin inventories without direct city membership", async () => {
    const directAssignmentCount = await db.models.CityUser.count({
      where: { cityId: projectAdminOnlyCity.cityId, userId: testUserID },
    });

    const res = await listAccessibleRoute(listAccessibleRequest(), {
      params: Promise.resolve({}),
    });

    await expectStatusCode(res, 200);
    const payload = await res.json();
    const matchingCity = payload.data.cities.find(
      (candidate: { city_id: string }) =>
        candidate.city_id === projectAdminOnlyCity.cityId,
    );
    const siblingProjectCity = payload.data.cities.find(
      (candidate: { city_id: string }) =>
        candidate.city_id === siblingProjectCityId,
    );

    expect(directAssignmentCount).toBe(0);
    expect(matchingCity).toEqual(
      expect.objectContaining({
        city_id: projectAdminOnlyCity.cityId,
        name: "Project Admin Only City",
        inventories: expect.arrayContaining([
          expect.objectContaining({
            inventory_id: projectAdminOnlyInventory.inventoryId,
            year: 2024,
          }),
        ]),
      }),
    );
    expect(siblingProjectCity).toBeUndefined();
  });

  it("filters listed inventories through the permission service", async () => {
    const originalCanAccessInventory =
      PermissionService.canAccessInventory.bind(PermissionService);
    const accessSpy = jest
      .spyOn(PermissionService, "canAccessInventory")
      .mockImplementation(async (targetSession, targetInventoryId, options) => {
        if (targetInventoryId === priorYearInventory.inventoryId) {
          throw new createHttpError.Forbidden("Access denied to inventory");
        }
        return originalCanAccessInventory(
          targetSession,
          targetInventoryId,
          options,
        );
      });

    const res = await listAccessibleRoute(
      listAccessibleRequest({ include_all_city_years: true }),
      { params: Promise.resolve({}) },
    );

    await expectStatusCode(res, 200);
    const payload = await res.json();
    const matchingCity = payload.data.cities.find(
      (candidate: { city_id: string }) => candidate.city_id === city.cityId,
    );

    expect(accessSpy).toHaveBeenCalledWith(
      expect.anything(),
      inventory.inventoryId,
      { includeResource: false },
    );
    expect(accessSpy).toHaveBeenCalledWith(
      expect.anything(),
      priorYearInventory.inventoryId,
      { includeResource: false },
    );
    expect(matchingCity.inventories).toEqual([
      expect.objectContaining({ inventory_id: inventory.inventoryId }),
    ]);
    expect(
      matchingCity.inventories.some(
        (candidate: { inventory_id: string }) =>
          candidate.inventory_id === priorYearInventory.inventoryId,
      ),
    ).toBe(false);

    // by_project must match the permission-filtered city list.
    const projectCities = payload.data.cities.filter(
      (candidate: { project_id: string | null }) =>
        candidate.project_id === testData.projectId,
    );
    const projectBreakdown = payload.data.by_project.find(
      (entry: { project_id: string | null }) =>
        entry.project_id === testData.projectId,
    );
    expect(projectBreakdown).toEqual(
      expect.objectContaining({
        project_id: testData.projectId,
        total_cities: projectCities.length,
        total_inventories: projectCities.reduce(
          (sum: number, candidate: { inventories: unknown[] }) =>
            sum + candidate.inventories.length,
          0,
        ),
      }),
    );
  });

  it("filters accessible inventories by city and year", async () => {
    const res = await listAccessibleRoute(
      listAccessibleRequest({ city_query: "york", year: 2024 }),
      { params: Promise.resolve({}) },
    );

    await expectStatusCode(res, 200);
    const payload = await res.json();
    const matchingCity = payload.data.cities.find(
      (candidate: { city_id: string }) => candidate.city_id === city.cityId,
    );

    expect(matchingCity.inventories).toEqual([
      expect.objectContaining({
        inventory_id: inventory.inventoryId,
        year: 2024,
      }),
    ]);
    expect(payload.data.filters).toEqual({
      city_id: null,
      city_query: "york",
      year: 2024,
      include_all_city_years: false,
    });
  });

  it("returns all matching city years when requested", async () => {
    const res = await listAccessibleRoute(
      listAccessibleRequest({
        city_query: "new york",
        year: 2024,
        include_all_city_years: true,
      }),
      { params: Promise.resolve({}) },
    );

    await expectStatusCode(res, 200);
    const payload = await res.json();
    const matchingCity = payload.data.cities.find(
      (candidate: { city_id: string }) => candidate.city_id === city.cityId,
    );

    expect(
      matchingCity.inventories.map(({ year }: { year: number }) => year),
    ).toEqual([2024, 2023]);
    expect(payload.data.filters).toEqual({
      city_id: null,
      city_query: "new york",
      year: 2024,
      include_all_city_years: true,
    });
  });

  it("returns compact whole-inventory status counts", async () => {
    const res = await statusOverviewRoute(capabilityRequest(city.cityId), {
      params: Promise.resolve({}),
    });

    await expectStatusCode(res, 200);
    const payload = await res.json();
    const stationaryEnergy = payload.data.by_sector.find(
      (sector: { reference: string }) => sector.reference === "I",
    );
    const transportation = payload.data.by_sector.find(
      (sector: { reference: string }) => sector.reference === "II",
    );

    expect(payload.action).toBe(INVENTORY_STATUS_OVERVIEW_CAPABILITY);
    expect(payload.success).toBe(true);
    expect(payload.data.city).toBe("New York, United States of America");
    expect(payload.data.inventory).toEqual({
      year: 2024,
      type: "gpc_basic",
      gwp: "ar6",
    });
    expect(payload.data.completion.required).toBeGreaterThan(0);
    expect(payload.data.completion.filled).toBeGreaterThan(0);
    expect(stationaryEnergy.data_state.third_party).toBe(1);
    expect(transportation.data_state.manual_or_uploaded).toBeGreaterThan(0);
    expect(JSON.stringify(payload)).not.toContain(inventory.inventoryId);
    expect(JSON.stringify(payload)).not.toContain(city.cityId);
  });

  it("returns sector shares, top emitters, and source summary", async () => {
    const res = await emissionsContextRoute(capabilityRequest(city.cityId), {
      params: Promise.resolve({}),
    });

    await expectStatusCode(res, 200);
    const payload = await res.json();

    expect(payload.action).toBe(INVENTORY_EMISSIONS_CONTEXT_CAPABILITY);
    expect(payload.success).toBe(true);
    expect(payload.data.total_emissions_tco2e).toBe("83950");
    expect(payload.data.by_sector).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sector: "Stationary Energy",
          reference: "I",
          emissions_tco2e: "40399",
          share_percent: 48.12,
        }),
      ]),
    );
    expect(payload.data.top_emitters[0]).toEqual(
      expect.objectContaining({
        sector: "Stationary Energy",
        subsector: "Residential buildings",
        scope: "Scope 1",
        emissions_tco2e: "40399",
        share_percent: 48.12,
      }),
    );
    expect(payload.data.source_summary.third_party_values).toBe(1);
    expect(
      payload.data.source_summary.manual_or_uploaded_values,
    ).toBeGreaterThan(0);
    expect(
      payload.data.source_summary.not_estimated_values,
    ).toBeGreaterThanOrEqual(1);
    expect(payload.data.source_summary.sectors_with_third_party_data).toContain(
      "Stationary Energy",
    );
  });

  it("rejects mismatched city and inventory scope", async () => {
    const res = await statusOverviewRoute(capabilityRequest(randomUUID()), {
      params: Promise.resolve({}),
    });

    await expectStatusCode(res, 400);
  });

  it("uses read access permission only", async () => {
    const accessSpy = jest.spyOn(PermissionService, "canAccessInventory");
    const editSpy = jest.spyOn(PermissionService, "canEditInventory");

    const res = await statusOverviewRoute(capabilityRequest(city.cityId), {
      params: Promise.resolve({}),
    });

    await expectStatusCode(res, 200);
    expect(accessSpy).toHaveBeenCalledWith(expect.anything(), inventoryId);
    expect(editSpy).not.toHaveBeenCalled();
  });
});

function capabilityRequest(cityId: string) {
  return mockRequest(
    {
      user_id: testUserID,
      city_id: cityId,
      inventory_id: inventoryId,
    },
    undefined,
    serviceHeaders,
  );
}

function listAccessibleRequest(overrides: Record<string, unknown> = {}) {
  return mockRequest(
    {
      user_id: testUserID,
      ...overrides,
    },
    undefined,
    serviceHeaders,
  );
}

async function createNotEstimatedValue(
  targetInventoryId: string,
): Promise<void> {
  const sector = await findSector("III");
  const subSector = await findSubSector("III.1");
  const subCategory = await findSubCategory("III.1.1");

  await db.models.InventoryValue.create({
    id: notEstimatedValueId,
    inventoryId: targetInventoryId,
    gpcReferenceNumber: "III.1.1",
    sectorId: sector.sectorId,
    subSectorId: subSector.subsectorId,
    subCategoryId: subCategory.subcategoryId,
    co2eqYears: 100,
    unavailableReason: "reason-NE",
    unavailableExplanation: "Missing waste data for route test.",
    inputMethodology: "direct-measure",
  });
}

async function findSector(referenceNumber: string) {
  const sector = await db.models.Sector.findOne({ where: { referenceNumber } });
  if (!sector) {
    throw new Error(`Missing Sector reference ${referenceNumber}`);
  }
  return sector;
}

async function findSubSector(referenceNumber: string) {
  const subSector = await db.models.SubSector.findOne({
    where: { referenceNumber },
  });
  if (!subSector) {
    throw new Error(`Missing SubSector reference ${referenceNumber}`);
  }
  return subSector;
}

async function findSubCategory(referenceNumber: string) {
  const subCategory = await db.models.SubCategory.findOne({
    where: { referenceNumber },
  });
  if (!subCategory) {
    throw new Error(`Missing SubCategory reference ${referenceNumber}`);
  }
  return subCategory;
}
