import { AppSession, Auth } from "@/lib/auth";
import { Roles } from "@/util/types";
import { afterAll, beforeAll, describe, expect, it, jest } from "@jest/globals";
import { mockRequest, setupTests, testUserID } from "../helpers";
import { db } from "@/models";
import {
  CreateOrganizationRequest,
  CreateProjectRequest,
} from "@/util/validation";
import { randomUUID } from "node:crypto";
import { Organization } from "@/models/Organization";
import { Project } from "@/models/Project";
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
  name: "Test Organization project Transfer",
  contactEmail: "testproject1@organization.com",
};

const projectData: Omit<CreateProjectRequest, "organizationId"> = {
  name: "Test Project 1",
  cityCountLimit: 10,
  description: "Test Description",
};

const projectData2: Omit<CreateProjectRequest, "organizationId"> = {
  name: "Test Project 2",
  cityCountLimit: 10,
  description: "Test Description",
};

const emptyParams = { params: Promise.resolve({}) };

describe("City Transfer API", () => {
  let organization: Organization;
  let project1: Project;
  let project2: Project;
  let prevGetServerSession = Auth.getServerSession;

  beforeAll(async () => {
    setupTests();
    await db.initialize();
    Auth.getServerSession = jest.fn(() => Promise.resolve(mockAdminSession));

    organization = await db.models.Organization.create({
      ...organizationData,
      active: true,
      organizationId: randomUUID(),
    });
    project1 = await db.models.Project.create({
      ...projectData,
      organizationId: organization.organizationId,
      projectId: randomUUID(),
    });
    project2 = await db.models.Project.create({
      ...projectData2,
      organizationId: organization.organizationId,
      projectId: randomUUID(),
    });
  });

  afterAll(() => {
    Auth.getServerSession = prevGetServerSession;
  });

  it("should transfer cities to a different project", async () => {
    const project2 = await db.models.Project.create({
      ...projectData2,
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
      projectId: project1.projectId,
    });

    expect(city.projectId).toBe(project1.projectId);

    const req = mockRequest({
      cityIds: [city.cityId],
      projectId: project2.projectId,
    });

    const res = await transferCity(req, emptyParams);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data).toEqual({ success: true });

    const updatedCity = await db.models.City.findByPk(city.cityId);
    expect(updatedCity?.projectId).toBe(project2.projectId);
  });

  it("should throw an error if city is not found", async () => {
    const validCity = await db.models.City.create({
      locode: "XX_CITY",
      name: "Test City",
      country: "Test Country",
      region: "Test Region",
      area: 1337,
      cityId: randomUUID(),
      projectId: project1.projectId,
    });

    const invalidCityId = randomUUID();
    const req = mockRequest({
      cityIds: [validCity.cityId, invalidCityId],
      projectId: project2.projectId,
    });

    const resJSON = await transferCity(req, emptyParams);
    const res = await resJSON.json();
    expect(resJSON.status).toBe(404);
    expect(res.error).toEqual({
      message: "Cities not found for IDs: " + invalidCityId,
    });
  });
  //
  it("should throw an error if user is not an admin", async () => {
    Auth.getServerSession = jest.fn(() => Promise.resolve(mockUserSession));

    const city = await db.models.City.create({
      locode: "XX_CITY",
      name: "Test City",
      country: "Test Country",
      region: "Test Region",
      area: 1337,
      cityId: randomUUID(),
      projectId: project1.projectId,
    });

    const req = mockRequest({
      cityIds: [city.cityId],
      projectId: project2.projectId,
    });

    const res = await transferCity(req, emptyParams);
    expect(res.status).toBe(403);
    const data = await res.json();
    expect(data.error).toEqual({ message: "Forbidden" });
  });
});
