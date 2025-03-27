import { POST as changeRole } from "@/app/api/v0/auth/role/route";
import { POST as createBulkInventories } from "@/app/api/v0/admin/bulk/route";
import { POST as bulkConnectDataSources } from "@/app/api/v0/admin/connect-sources/route";
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
import { mockRequest, setupTests, testUserData, testUserID } from "../helpers";
import { AppSession, Auth } from "@/lib/auth";
import { Roles } from "@/util/types";
import {
  BulkInventoryCreateProps,
  BulkInventoryUpdateProps,
} from "@/backend/AdminService";
import { Op } from "sequelize";
import _ from "lodash";

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
  cityLocodes: ["US NYC", "DE BER", "BR AAX"],
  emails: [testUserData.email],
  years: [2022, 2023, 2024],
  scope: "gpc_basic_plus",
  gwp: "AR6",
};

const mockConnectSourcesRequest: BulkInventoryUpdateProps = {
  cityLocodes: ["US NYC"],
  userEmail: testUserData.email,
  years: [2022, 2023],
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
    const res = await createBulkInventories(req, { params: {} });
    expect(res.status).toBe(200);
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
    const res = await bulkConnectDataSources(req, { params: {} });
    expect(res.status).toBe(200);
    const body = await res.json();
    // expect(body.errors.length).toBe(0);
    console.error(body.errors.slice(0, 10));
  }, 60000);

  it("should change the user role when logged in as admin", async () => {
    const req = mockRequest({
      email: testUserData.email,
      role: Roles.Admin,
    });
    Auth.getServerSession = jest.fn(() => Promise.resolve(mockAdminSession));
    const res = await changeRole(req, { params: {} });
    expect(res.status).toBe(200);
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
    const res = await changeRole(req, { params: {} });
    expect(res.status).toBe(403);

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
    const res = await changeRole(req, { params: {} });
    expect(res.status).toBe(404);
  });

  it("should validate the request", async () => {
    Auth.getServerSession = jest.fn(() => Promise.resolve(mockAdminSession));

    const req = mockRequest({ email: testUserData.email, role: "invalid" });
    const res = await changeRole(req, { params: {} });
    expect(res.status).toBe(400);

    const req2 = mockRequest({ email: "not-an-email", role: "admin" });
    const res2 = await changeRole(req2, { params: {} });
    expect(res2.status).toBe(400);

    const req3 = mockRequest({});
    const res3 = await changeRole(req3, { params: {} });
    expect(res3.status).toBe(400);
  });
});
