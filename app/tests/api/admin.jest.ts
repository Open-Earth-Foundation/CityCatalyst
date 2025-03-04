import { POST as changeRole } from "@/app/api/v0/auth/role/route";
import { POST as createBulkInventories } from "@/app/api/v0/admin/bulk/route";
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
import { BulkInventoryProps } from "@/backend/AdminService";

const mockSession: AppSession = {
  user: { id: testUserID, role: Roles.User },
  expires: "1h",
};
const mockAdminSession: AppSession = {
  user: { id: testUserID, role: Roles.Admin },
  expires: "1h",
};
const mockBulkInventoriesRequest: BulkInventoryProps = {
  cityLocodes: ["US NYC", "DE BER", "BR AAX"],
  emails: ["test1@example.com", "test2@example.com"],
  years: [2022, 2023, 2024],
  scope: "gpc_basic_plus",
  gwp: "AR6",
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
    console.dir(body.errors.slice(0, 10));
    // expect(body.errors.length).toBe(0); // TODO ignore missing data from Global API in errors
    expect(body.results.length).toBe(
      mockBulkInventoriesRequest.cityLocodes.length,
    );

    // TODO assert required database changes:
    // TODO check inventories created
    // TODO check population entries for inventory
    // TODO check all data sources for inventory are connected
    // TODO check that users were added to inventory (without sending the emails)
    // TODO check all data sources are connected
    // TODO check all users were invited
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
