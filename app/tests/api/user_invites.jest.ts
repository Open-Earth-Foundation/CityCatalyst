import { afterAll, beforeAll, describe, expect, it, jest } from "@jest/globals";
import { db } from "@/models";
import { Auth, AppSession } from "@/lib/auth";
import { City } from "@/models/City";
import { Roles } from "@/util/types";
import {
  expectStatusCode,
  mockRequest,
  setupTests,
  testUserID,
} from "../helpers";
import { randomUUID } from "node:crypto";

const sendEmailMock = jest.fn(async () => {
  throw new Error("Invalid login: 535 Authentication failed");
});
jest.unstable_mockModule("@/lib/email", () => ({ sendEmail: sendEmailMock }));
// Imported after the mock is registered so the route picks up the mocked module.
const { POST: createUserInvites } =
  await import("@/app/api/v1/user/invites/route");

const systemAdminSession: AppSession = {
  user: { id: testUserID, role: Roles.Admin },
  expires: "1h",
};

const inviteEmail = "email-failure-invite@example.com";

describe("User Invites API", () => {
  let city: City;

  beforeAll(async () => {
    setupTests();
    await db.initialize();
    await db.models.User.upsert({ userId: testUserID, name: "TEST_USER" });

    const project = await db.models.Project.findOne({
      where: { name: "cc_project_default" },
    });
    city = await db.models.City.create({
      cityId: randomUUID(),
      name: "Invite Email Failure City",
      projectId: project?.projectId,
    });
  });

  afterAll(async () => {
    await db.models.CityInvite.destroy({ where: { email: inviteEmail } });
    await city?.destroy();
    if (db.sequelize) await db.sequelize.close();
  });

  it("should reject an invite request with no cities selected", async () => {
    const req = mockRequest({
      projectId: randomUUID(),
      cityIds: [],
      invites: [
        { email: "no-cities-selected@example.com", role: "collaborator" },
      ],
    });
    const res = await createUserInvites(req, {
      params: Promise.resolve({}),
    });

    await expectStatusCode(res, 400);
  });

  it("should still create the invite and return its URL when the email fails to send", async () => {
    jest
      .spyOn(Auth, "getServerSession")
      .mockResolvedValueOnce(systemAdminSession);

    const req = mockRequest({
      projectId: city.projectId,
      cityIds: [city.cityId],
      invites: [{ email: inviteEmail, role: "collaborator" }],
    });
    const res = await createUserInvites(req, {
      params: Promise.resolve({}),
    });

    await expectStatusCode(res, 200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.inviteUrls[inviteEmail]).toContain("/user/invites?");
    expect(sendEmailMock).toHaveBeenCalled();

    const invite = await db.models.CityInvite.findOne({
      where: { email: inviteEmail, cityId: city.cityId },
    });
    expect(invite).not.toBeNull();
  });
});
