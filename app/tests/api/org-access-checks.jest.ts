import { afterAll, beforeAll, describe, it, jest } from "@jest/globals";
import { db } from "@/models";
import { Auth, AppSession } from "@/lib/auth";
import { Roles } from "@/util/types";
import {
  expectStatusCode,
  mockRequest,
  setupTests,
  testUserID,
} from "../helpers";
import { randomUUID } from "node:crypto";

jest.unstable_mockModule("@/lib/email", () => ({
  sendEmail: jest.fn(async () => undefined),
}));
const { POST: createUserInvites } =
  await import("@/app/api/v1/user/invites/route");
const { GET: getProjectUsers, DELETE: deleteProjectUser } =
  await import("@/app/api/v1/projects/[project]/users/route");
const { DELETE: deleteOrganizationUser } =
  await import("@/app/api/v1/organizations/[organization]/users/route");

const regularSession: AppSession = {
  user: { id: testUserID, role: Roles.User },
  expires: "1h",
};

describe("Organization scoped access checks (CC-994)", () => {
  const orgAId = randomUUID();
  const orgBId = randomUUID();
  const projectAId = randomUUID();
  const projectBId = randomUUID();
  const cityAId = randomUUID();
  const cityBId = randomUUID();

  const asRegularUser = () =>
    jest.spyOn(Auth, "getServerSession").mockResolvedValue(regularSession);

  beforeAll(async () => {
    setupTests();
    await db.initialize();
    await db.models.User.upsert({ userId: testUserID, name: "TEST_USER" });

    for (const [organizationId, name] of [
      [orgAId, "cc994-org-a"],
      [orgBId, "cc994-org-b"],
    ]) {
      await db.models.Organization.create({
        organizationId,
        name,
        contactEmail: `${name}@example.com`,
        active: true,
      });
    }
    for (const [projectId, organizationId, name] of [
      [projectAId, orgAId, "cc994-project-a"],
      [projectBId, orgBId, "cc994-project-b"],
    ]) {
      await db.models.Project.create({
        description: "cc994",
        projectId,
        organizationId,
        name,
        cityCountLimit: 5,
      });
    }
    await db.models.City.create({
      cityId: cityAId,
      name: "cc994-city-a",
      projectId: projectAId,
    });
    await db.models.City.create({
      cityId: cityBId,
      name: "cc994-city-b",
      projectId: projectBId,
    });
  });

  afterAll(async () => {
    jest.restoreAllMocks();
    await db.models.CityInvite.destroy({
      where: { email: "cc994-invitee@example.com" },
    });
    await db.models.OrganizationAdmin.destroy({
      where: { organizationId: [orgAId, orgBId] },
    });
    await db.models.City.destroy({ where: { cityId: [cityAId, cityBId] } });
    await db.models.Project.destroy({
      where: { projectId: [projectAId, projectBId] },
    });
    await db.models.Organization.destroy({
      where: { organizationId: [orgAId, orgBId] },
    });
    if (db.sequelize) await db.sequelize.close();
  });

  const params = (p: Record<string, string>) => ({
    params: Promise.resolve(p),
  });

  it("denies listing project users to a user outside the organization", async () => {
    asRegularUser();
    const res = await getProjectUsers(
      mockRequest(),
      params({ project: projectBId }),
    );
    await expectStatusCode(res, 403);
  });

  it("denies removing project users for a user outside the organization", async () => {
    asRegularUser();
    const req = mockRequest(undefined, { email: "someone@example.com" });
    const res = await deleteProjectUser(req, params({ project: projectBId }));
    await expectStatusCode(res, 403);
  });

  it("denies removing organization admins for a user outside the organization", async () => {
    asRegularUser();
    const res = await deleteOrganizationUser(
      mockRequest(undefined, { email: "someone@example.com" }),
      params({ organization: orgBId }),
    );
    await expectStatusCode(res, 403);
  });

  it("rejects invites into another organization's cities", async () => {
    asRegularUser();
    await db.models.OrganizationAdmin.create({
      organizationAdminId: randomUUID(),
      organizationId: orgAId,
      userId: testUserID,
    });
    const res = await createUserInvites(
      mockRequest({
        projectId: projectBId,
        cityIds: [cityBId],
        invites: [{ email: "cc994-invitee@example.com", role: "collaborator" }],
      }),
      params({}),
    );
    await expectStatusCode(res, 404);
  });

  it("rejects invites whose project does not own the cities", async () => {
    asRegularUser();
    const res = await createUserInvites(
      mockRequest({
        projectId: projectBId,
        cityIds: [cityAId],
        invites: [{ email: "cc994-invitee@example.com", role: "collaborator" }],
      }),
      params({}),
    );
    await expectStatusCode(res, 400);
  });

  it("allows an admin of several organizations to invite into any of them", async () => {
    asRegularUser();
    await db.models.OrganizationAdmin.findOrCreate({
      where: { organizationId: orgBId, userId: testUserID },
      defaults: { organizationAdminId: randomUUID() },
    });
    for (const [projectId, cityId] of [
      [projectAId, cityAId],
      [projectBId, cityBId],
    ]) {
      const res = await createUserInvites(
        mockRequest({
          projectId,
          cityIds: [cityId],
          invites: [
            { email: "cc994-invitee@example.com", role: "collaborator" },
          ],
        }),
        params({}),
      );
      await expectStatusCode(res, 200);
    }
  });
});
