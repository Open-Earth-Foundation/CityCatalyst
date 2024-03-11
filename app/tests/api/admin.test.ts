import { POST as changeRole } from "@/app/api/v0/auth/role/route";
import { db } from "@/models";
import assert from "node:assert";
import { after, before, beforeEach, describe, it, mock } from "node:test";
import { mockRequest, setupTests, testUserData, testUserID } from "../helpers";
import { AppSession, Auth, Roles } from "@/lib/auth";

const mockSession: AppSession = {
  user: { id: testUserID, role: "user" },
  expires: "1h",
};
const mockAdminSession: AppSession = {
  user: { id: testUserID, role: "admin" },
  expires: "1h",
};

describe("Admin API", () => {
  let prevGetServerSession = Auth.getServerSession;

  before(async () => {
    setupTests();
    await db.initialize();
  });

  after(async () => {
    Auth.getServerSession = prevGetServerSession;
    if (db.sequelize) await db.sequelize.close();
  });

  beforeEach(async () => {
    Auth.getServerSession = mock.fn(() => Promise.resolve(mockSession));
    await db.models.User.upsert({
      userId: testUserID,
      name: testUserData.name,
      email: testUserData.email,
      role: Roles.User,
    });
  });

  it("should change the user role when logged in as admin", async () => {
    const req = mockRequest({ email: testUserData.email, role: Roles.Admin });
    Auth.getServerSession = mock.fn(() => Promise.resolve(mockAdminSession));
    const res = await changeRole(req, { params: {} });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);

    const user = await db.models.User.findOne({
      where: { email: testUserData.email },
    });
    assert.equal(user?.role, Roles.Admin);
  });

  it("should not change the user role when logged in as normal user", async () => {
    const req = mockRequest({ email: testUserData.email, role: Roles.Admin });
    const res = await changeRole(req, { params: {} });
    assert.equal(res.status, 403);

    const user = await db.models.User.findOne({
      where: { email: testUserData.email },
    });
    assert.equal(user?.role, Roles.User);
  });

  it("should validate the request", async () => {
    Auth.getServerSession = mock.fn(() => Promise.resolve(mockAdminSession));
    const req = mockRequest({ email: testUserData.email, role: "invalid" });
    const res = await changeRole(req, { params: {} });
    assert.equal(res.status, 400);
    console.log(await res.text());
    const req2 = mockRequest({ email: "not-an-email", role: "Admin" });
    const res2 = await changeRole(req2, { params: {} });
    assert.equal(res2.status, 400);
    const req3 = mockRequest({});
    const res3 = await changeRole(req3, { params: {} });
    assert.equal(res3.status, 400);
  });
});
