import { AppSession, Auth } from "@/lib/auth";
import { Roles } from "@/util/types";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";
import { mockRequest, setupTests, testUserID } from "../helpers";
import { db } from "@/models";
import {
  CreateOrganizationRequest,
  CreateProjectRequest,
} from "@/util/validation";
import { randomUUID } from "node:crypto";
import { Organization } from "@/models/Organization";
import { PATCH as transferCity } from "@/app/api/v0/city/transfer/route";

const mockUserSession: AppSession = {
  user: { id: testUserID, role: Roles.User },
  expires: "1h",
};

const mockAdminSession: AppSession = {
  user: { id: testUserID, role: Roles.Admin },
  expires: "1h",
};

const organizationData: CreateOrganizationRequest = {
  name: "Test Organization project",
  contactEmail: "testproject@organization.com",
};

const projectData: Omit<CreateProjectRequest, "organizationId"> = {
  name: "Test Project",
  cityCountLimit: 10,
  description: "Test Description",
};

describe("City Transfer API", () => {
  let organization: Organization;
  let prevGetServerSession = Auth.getServerSession;

  beforeAll(async () => {
    setupTests();
    Auth.getServerSession = jest.fn(() => Promise.resolve(mockAdminSession));
    organization = await db.models.Organization.create({
      ...organizationData,
      organizationId: randomUUID(),
    });
  });

  beforeEach(async () => {
    Auth.getServerSession = prevGetServerSession;
  });

  afterAll(() => {
    Auth.getServerSession = prevGetServerSession;
  });

  it("should transfer cities to a different project", async () => {
    const project = await db.models.Project.create({
      ...projectData,
      name: "Test Project 1",
      organizationId: organization.organizationId,
      projectId: randomUUID(),
    });

    const project2 = await db.models.Project.create({
      ...projectData,
      name: "Test Project 2",
      organizationId: organization.organizationId,
      projectId: randomUUID(),
    });

    const city = await db.models.City.create({
      locode: "XX_CITY",
      name: "Test City",
      country: "Test Country",
      region: "Test Region",
      area: 1337,
      cityId: randomUUID(),
      projectId: project.projectId,
    });

    expect(city.projectId).toBe(project.projectId);

    const req = mockRequest({
      cityIds: [city.cityId],
      projectId: project2.projectId,
    });

    const res = await transferCity(req, { params: {} });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true });

    const updatedCity = await db.models.City.findByPk(city.cityId);
    expect(updatedCity?.projectId).toBe(project2.projectId);
  });
});
