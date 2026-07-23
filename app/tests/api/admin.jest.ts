import { POST as changeRole } from "@/app/api/v1/auth/role/route";
import { POST as createBulkInventories } from "@/app/api/v1/admin/bulk/route";
import { POST as bulkConnectDataSources } from "@/app/api/v1/admin/connect-sources/route";
import { POST as provisionDemoInventory } from "@/app/api/v1/admin/demo-inventory/route";
import { db } from "@/models";
import {
  beforeAll,
  afterAll,
  beforeEach,
  describe,
  it,
  expect,
  jest,
} from "@jest/globals";
import {
  expectStatusCode,
  mockRequest,
  setupTests,
  testUserData,
  testUserID,
} from "../helpers";
import { AppSession, Auth } from "@/lib/auth";
import { Roles } from "@/util/types";
import {
  BulkInventoryCreateProps,
  BulkInventoryUpdateProps,
} from "@/backend/AdminService";
import { Op } from "sequelize";
import _ from "lodash";
import { DEFAULT_PROJECT_ID } from "@/util/constants";
import { randomUUID } from "node:crypto";
import { ProvisionDemoInventoryResponse } from "@/util/types";

const mockSession: AppSession = {
  user: { id: testUserID, role: Roles.User },
  expires: "1h",
};
const mockAdminSession: AppSession = {
  user: { id: testUserID, role: Roles.Admin },
  expires: "1h",
};
const cityLocodeMap: Record<string, string> = {
  "US NYC": "New York",
  "DE BER": "Berlin",
  "BR AAX": "Araxá",
};
const mockBulkInventoriesRequest: BulkInventoryCreateProps = {
  cityLocodes: ["BR AAX"],
  emails: [testUserData.email],
  years: [2022],
  scope: "gpc_basic_plus",
  gwp: "AR6",
  projectId: DEFAULT_PROJECT_ID,
};

const mockConnectSourcesRequest: BulkInventoryUpdateProps = {
  cityLocodes: ["US NYC"],
  userEmail: testUserData.email,
  years: [2022],
};

const emptyParams = { params: Promise.resolve({}) };

const createDemoProject = async (cityCountLimit = 2) => {
  const organization = await db.models.Organization.create({
    organizationId: randomUUID(),
    name: `Demo Inventory Test Org ${randomUUID()}`,
    contactEmail: `demo-${randomUUID()}@example.com`,
    active: true,
  });
  const project = await db.models.Project.create({
    projectId: randomUUID(),
    name: "Demo Inventory Test Project",
    description: "Project for demo inventory provisioning tests",
    cityCountLimit,
    organizationId: organization.organizationId,
  });

  return { organization, project };
};

const countDemoInventoryData = async (inventoryId: string) => {
  const inventoryValues = await db.models.InventoryValue.count({
    where: { inventoryId },
  });
  const gasValues = await db.models.GasValue.count({
    include: [
      {
        model: db.models.InventoryValue,
        as: "inventoryValue",
        where: { inventoryId },
        required: true,
      },
    ],
  });
  const activityValues = await db.models.ActivityValue.count({
    include: [
      {
        model: db.models.InventoryValue,
        as: "inventoryValue",
        where: { inventoryId },
        required: true,
      },
    ],
  });
  const unavailableValues = await db.models.InventoryValue.count({
    where: { inventoryId, unavailableReason: "not-estimated" },
  });

  return { inventoryValues, gasValues, activityValues, unavailableValues };
};

describe("Admin API", () => {
  let prevGetServerSession = Auth.getServerSession;

  beforeAll(async () => {
    setupTests();
    await db.initialize();
  });

  afterAll(async () => {
    Auth.getServerSession = prevGetServerSession;
    if (db.sequelize) await db.sequelize.close();
  });

  beforeEach(async () => {
    Auth.getServerSession = jest.fn(() => Promise.resolve(mockSession));
    await db.models.User.upsert({
      userId: testUserID,
      name: testUserData.name,
      email: testUserData.email,
      role: Roles.User,
    });
  });

  it("should allow creating bulk inventories for admin users", async () => {
    const req = mockRequest(mockBulkInventoriesRequest);
    Auth.getServerSession = jest.fn(() => Promise.resolve(mockAdminSession));
    const res = await createBulkInventories(req, emptyParams);
    await expectStatusCode(res, 200);
    const body = await res.json();
    expect(body.errors.length).toBe(0);
    expect(body.results.length).toBe(
      mockBulkInventoriesRequest.cityLocodes.length,
    );

    // check inventories were created
    const inventoryIds = body.results.flatMap((result: any) => result.result);
    expect(inventoryIds.length).toBe(
      mockBulkInventoriesRequest.years.length *
        mockBulkInventoriesRequest.cityLocodes.length,
    );
    const cities = await db.models.City.findAll({
      attributes: ["cityId", "locode", "name"],
      include: {
        model: db.models.Inventory,
        as: "inventories",
        where: { inventoryId: { [Op.in]: inventoryIds } },
      },
    });
    for (const city of cities) {
      expect(city.locode).toBeDefined();
      const expectedName = cityLocodeMap[city.locode!];
      expect(city.name).toBe(expectedName);
    }

    const cityIds = cities.map((city) => city.cityId);
    const uniqueCityIds = [...new Set(cityIds)];

    // check population entries for inventory
    for (const cityId of uniqueCityIds) {
      const populationEntries = await db.models.Population.findAll({
        where: { cityId },
      });
      const hasCityPopulation = _.some(
        populationEntries,
        (entry) => entry.population != null,
      );
      const hasCountryPopulation = _.some(
        populationEntries,
        (entry) => entry.countryPopulation != null,
      );
      const hasRegionPopulation = _.some(
        populationEntries,
        (entry) => entry.regionPopulation != null,
      );
      expect(hasCityPopulation).toBe(true);
      expect(hasCountryPopulation).toBe(true);
      expect(hasRegionPopulation).toBe(true);

      // check that users were added to inventory (without sending the emails)
      const cityUsers = await db.models.CityUser.findAll({
        where: { cityId },
      });
      expect(cityUsers.length).toBe(1);
      for (const cityUser of cityUsers) {
        expect(cityUser.userId).toBe(testUserID);
      }

      // TODO check all data sources for inventory are connected
    }
  }, 30000);

  it("should allow connecting bulk data sources for admin users", async () => {
    const req = mockRequest(mockConnectSourcesRequest);
    Auth.getServerSession = jest.fn(() => Promise.resolve(mockAdminSession));
    const res = await bulkConnectDataSources(req, emptyParams);
    await expectStatusCode(res, 200);
    const body = await res.json();
    // expect(body.errors.length).toBe(0);
    console.error(body.errors.slice(0, 10));
  }, 60000);

  it("should provision a demo inventory for admin users", async () => {
    const { project } = await createDemoProject();
    const req = mockRequest({
      projectId: project.projectId,
      templateId: "porto-alegre-2022",
    });
    Auth.getServerSession = jest.fn(() => Promise.resolve(mockAdminSession));

    const res = await provisionDemoInventory(req, emptyParams);
    expect(res.status).toBe(200);
    const body = (await res.json()) as ProvisionDemoInventoryResponse;

    expect(body.templateId).toBe("porto-alegre-2022");
    expect(body.createdCity).toBe(true);
    expect(body.createdInventory).toBe(true);
    expect(body.importedRows).toBe(70);
    expect(body.skippedRows).toBe(2);

    const city = await db.models.City.findByPk(body.cityId);
    expect(city?.name).toBe("Porto Alegre Demo");
    expect(city?.locode).toBe(`DEMO-porto-alegre-2022-${project.projectId}`);

    const inventory = await db.models.Inventory.findByPk(body.inventoryId);
    expect(inventory?.inventoryName).toBe("Porto Alegre 2022 Demo Inventory");
    expect(inventory?.year).toBe(2022);

    const counts = await countDemoInventoryData(body.inventoryId);
    expect(counts.inventoryValues).toBe(46);
    expect(counts.gasValues).toBe(36);
    expect(counts.activityValues).toBe(44);
    expect(counts.unavailableValues).toBe(26);
  }, 30000);

  it("should not duplicate an existing demo inventory", async () => {
    const { project } = await createDemoProject();
    Auth.getServerSession = jest.fn(() => Promise.resolve(mockAdminSession));

    const firstRes = await provisionDemoInventory(
      mockRequest({
        projectId: project.projectId,
        templateId: "porto-alegre-2022",
      }),
      emptyParams,
    );
    expect(firstRes.status).toBe(200);
    const firstBody = (await firstRes.json()) as ProvisionDemoInventoryResponse;

    const secondRes = await provisionDemoInventory(
      mockRequest({
        projectId: project.projectId,
        templateId: "porto-alegre-2022",
      }),
      emptyParams,
    );
    expect(secondRes.status).toBe(200);
    const secondBody =
      (await secondRes.json()) as ProvisionDemoInventoryResponse;

    expect(secondBody.cityId).toBe(firstBody.cityId);
    expect(secondBody.inventoryId).toBe(firstBody.inventoryId);
    expect(secondBody.createdCity).toBe(false);
    expect(secondBody.createdInventory).toBe(false);
    expect(secondBody.importedRows).toBe(0);
    expect(secondBody.warnings).toContain(
      "Demo inventory already had imported values; import skipped.",
    );

    const cityCount = await db.models.City.count({
      where: { locode: `DEMO-porto-alegre-2022-${project.projectId}` },
    });
    const inventoryCount = await db.models.Inventory.count({
      where: { cityId: firstBody.cityId, year: 2022 },
    });
    expect(cityCount).toBe(1);
    expect(inventoryCount).toBe(1);
  }, 30000);

  it("should reject demo inventory provisioning for non-admin users", async () => {
    const { project } = await createDemoProject();
    const req = mockRequest({
      projectId: project.projectId,
      templateId: "porto-alegre-2022",
    });

    const res = await provisionDemoInventory(req, emptyParams);
    expect(res.status).toBe(401);
  });

  it("should reject demo inventory provisioning when the project city limit is reached", async () => {
    const { project } = await createDemoProject(0);
    const req = mockRequest({
      projectId: project.projectId,
      templateId: "porto-alegre-2022",
    });
    Auth.getServerSession = jest.fn(() => Promise.resolve(mockAdminSession));

    const res = await provisionDemoInventory(req, emptyParams);
    expect(res.status).toBe(400);
  });

  it("should change the user role when logged in as admin", async () => {
    const req = mockRequest({
      email: testUserData.email,
      role: Roles.Admin,
    });
    Auth.getServerSession = jest.fn(() => Promise.resolve(mockAdminSession));
    const res = await changeRole(req, emptyParams);
    await expectStatusCode(res, 200);
    const body = await res.json();
    expect(body.success).toBe(true);

    const user = await db.models.User.findOne({
      where: { email: testUserData.email },
    });
    expect(user?.role).toBe(Roles.Admin);
  });

  it("should not change the user role when logged in as normal user", async () => {
    const req = mockRequest({
      email: testUserData.email,
      role: Roles.Admin,
    });
    const res = await changeRole(req, emptyParams);
    await expectStatusCode(res, 403);

    const user = await db.models.User.findOne({
      where: { email: testUserData.email },
    });
    expect(user?.role).toBe(Roles.User);
  });

  it("should return a 404 error when user does not exist", async () => {
    const req = mockRequest({
      email: "not-existing@example.com",
      role: Roles.Admin,
    });
    Auth.getServerSession = jest.fn(() => Promise.resolve(mockAdminSession));
    const res = await changeRole(req, emptyParams);
    await expectStatusCode(res, 404);
  });

  it("should validate the request", async () => {
    Auth.getServerSession = jest.fn(() => Promise.resolve(mockAdminSession));

    const req = mockRequest({ email: testUserData.email, role: "invalid" });
    const res = await changeRole(req, emptyParams);
    await expectStatusCode(res, 400);

    const req2 = mockRequest({ email: "not-an-email", role: "admin" });
    const res2 = await changeRole(req2, emptyParams);
    expect(res2.status).toBe(400);

    const req3 = mockRequest({});
    const res3 = await changeRole(req3, emptyParams);
    expect(res3.status).toBe(400);
  });
});
