import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";
import {
  DELETE as deleteOrganization,
  GET as getOrganization,
  PATCH as updateOrganization,
} from "@/app/api/v0/organizations/[organization]/route";
import { db } from "@/models";
import { CreateOrganizationRequest } from "@/util/validation";
import { mockRequest, setupTests, testUserID } from "../helpers";
import { Organization } from "@/models/Organization";
import { randomUUID } from "node:crypto";
import { AppSession, Auth } from "@/lib/auth";
import { Roles } from "@/util/types";

const organizationData: CreateOrganizationRequest = {
  name: "Test Organization - Organization API Test",
  contactEmail: "test-org-api-test@organization.com",
};

const organization2: CreateOrganizationRequest = {
  name: "Test Organization 2 - Organization API Test",
  contactEmail: "test2-org-api-test@organization.com",
};

const invalidOrganization = {
  name: "",
  contactEmail: 123,
};

const mockAdminSession: AppSession = {
  user: { id: testUserID, role: Roles.Admin },
  expires: "1h",
};

const mockUserSession: AppSession = {
  user: { id: testUserID, role: Roles.User },
  expires: "1h",
};

describe("Organization API", () => {
  let organization: Organization;
  let prevGetServerSession = Auth.getServerSession;

  beforeAll(async () => {
    setupTests();
    await db.initialize();
    Auth.getServerSession = jest.fn(() => Promise.resolve(mockAdminSession));
  });

  beforeEach(async () => {
    await db.models.Organization.destroy({
      where: { name: organizationData.name },
    });
    organization = await db.models.Organization.create({
      active: true,
      ...organizationData,
      organizationId: randomUUID(),
    });
  });

  afterAll(async () => {
    Auth.getServerSession = prevGetServerSession;
    if (db.sequelize) await db.sequelize.close();
  });

  it("should find an organization", async () => {
    const req = mockRequest();
    const res = await getOrganization(req, {
      params: Promise.resolve({ organizationId: organization.organizationId }),
    });
    expect(res.status).toEqual(200);
    const data = await res.json();
    expect(data.name).toEqual(organizationData.name);
    expect(data.contactEmail).toEqual(organizationData.contactEmail);
  });

  it("should not find a non-existing organization", async () => {
    const req = mockRequest();
    const res = await getOrganization(req, {
      params: Promise.resolve({ organizationId: randomUUID() }),
    });
    expect(res.status).toEqual(404);
  });

  it("should update an organization", async () => {
    const req = mockRequest(organization2);
    const res = await updateOrganization(req, {
      params: Promise.resolve({ organizationId: organization.organizationId }),
    });
    expect(res.status).toEqual(200);
    const data = await res.json();
    expect(data.name).toEqual(organization2.name);
    expect(data.contactEmail).toEqual(organization2.contactEmail);
  });

  it("should not update an organization with invalid values", async () => {
    const req = mockRequest(invalidOrganization);
    const res = await updateOrganization(req, {
      params: Promise.resolve({ organizationId: organization.organizationId }),
    });
    expect(res.status).toEqual(400);
    const {
      error: { issues },
    } = await res.json();
    expect(issues).toEqual([
      {
        code: "invalid_type",
        expected: "string",
        received: "number",
        path: ["contactEmail"],
        message: "Expected string, received number",
      },
    ]);
  });

  it("should delete an organization", async () => {
    const req = mockRequest();
    const res = await deleteOrganization(req, {
      params: Promise.resolve({ organizationId: organization.organizationId }),
    });
    expect(res.status).toEqual(200);
    const { deleted } = await res.json();
    expect(deleted).toBe(true);
  });

  it("should not delete a non-existing organization", async () => {
    const req = mockRequest();
    const res = await deleteOrganization(req, {
      params: Promise.resolve({ organizationId: randomUUID() }),
    });
    expect(res.status).toEqual(404);
  });

  it("should not allow non-admins to update an organization", async () => {
    Auth.getServerSession = jest.fn(() => Promise.resolve(mockUserSession));
    const req = mockRequest(organization2);
    const res = await updateOrganization(req, {
      params: Promise.resolve({ organizationId: organization.organizationId }),
    });
    expect(res.status).toEqual(403);
  });

  it("should not allow non-admins to delete an organization", async () => {
    Auth.getServerSession = jest.fn(() => Promise.resolve(mockUserSession));
    const req = mockRequest();
    const res = await deleteOrganization(req, {
      params: Promise.resolve({ organizationId: organization.organizationId }),
    });
    expect(res.status).toEqual(403);
  });
});
