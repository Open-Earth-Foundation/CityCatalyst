import { POST as changeRole } from "@/app/api/v0/auth/role/route";
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

const mockSession: AppSession = {
  user: { id: testUserID, role: Roles.User },
  expires: "1h",
};
const mockAdminSession: AppSession = {
  user: { id: testUserID, role: Roles.Admin },
  expires: "1h",
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

    const req2 = mockRequest({ email: "not-an-email", role: "Admin" });
    const res2 = await changeRole(req2, { params: {} });
    expect(res2.status).toBe(400);

    const req3 = mockRequest({});
    const res3 = await changeRole(req3, { params: {} });
    expect(res3.status).toBe(400);
  });
});
