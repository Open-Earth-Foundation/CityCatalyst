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
  GET as getOrganizations,
  POST as createOrganization,
} from "@/app/api/v0/organizations/route";
import { db } from "@/models";
import { CreateOrganizationRequest } from "@/util/validation";
import { mockRequest, setupTests, testUserID } from "../helpers";
import { Organization } from "@/models/Organization";
import { randomUUID } from "node:crypto";
import { AppSession, Auth } from "@/lib/auth";
import { Roles } from "@/util/types";

const getUniqueOrganizationData = (): CreateOrganizationRequest => ({
  name: `Test Organization ${randomUUID().slice(0, 8)}`,
  contactEmail: `test+${randomUUID().slice(0, 8)}@organization.com`,
});

const invalidOrganization = {
  name: "",
  contactEmail: "invalid-email",
};

const mockAdminSession: AppSession = {
  user: { id: testUserID, role: Roles.Admin },
  expires: "1h",
};

const mockUserSession: AppSession = {
  user: { id: testUserID, role: Roles.User },
  expires: "1h",
};

const emptyParams = { params: Promise.resolve({}) };

describe("Organization API", () => {
  let organization: Organization;
  let prevGetServerSession = Auth.getServerSession;
  let organizationData: CreateOrganizationRequest;

  beforeAll(async () => {
    setupTests();
    await db.initialize();
  });

  beforeEach(async () => {
    // Create unique organization data for each test to avoid conflicts
    organizationData = getUniqueOrganizationData();
    organization = await db.models.Organization.create({
      active: true,
      ...organizationData,
      organizationId: randomUUID(),
    });
    Auth.getServerSession = jest.fn(() => Promise.resolve(mockAdminSession));
  });

  afterAll(async () => {
    Auth.getServerSession = prevGetServerSession;
    if (db.sequelize) await db.sequelize.close();
  });

  it("should create an organization", async () => {
    // Create unique org data for this test
    const uniqueOrgData = getUniqueOrganizationData();
    
    const req = mockRequest(uniqueOrgData);
    const res = await createOrganization(req, emptyParams);
    expect(res.status).toEqual(201);
    const data = await res.json();
    expect(data.name).toEqual(uniqueOrgData.name);
    expect(data.contactEmail).toEqual(uniqueOrgData.contactEmail);
  });

  it("should not create an organization with invalid data", async () => {
    const req = mockRequest(invalidOrganization);
    const res = await createOrganization(req, emptyParams);
    expect(res.status).toEqual(400);
    const {
      error: { issues },
    } = await res.json();
    expect(issues).toEqual([
      {
        validation: "email",
        code: "invalid_string",
        message: "Invalid email",
        path: ["contactEmail"],
      },
    ]);
  });

  it("should not allow non-admins to create an organization", async () => {
    Auth.getServerSession = jest.fn(() => Promise.resolve(mockUserSession));
    const uniqueOrgData = getUniqueOrganizationData();
    const req = mockRequest(uniqueOrgData);
    const res = await createOrganization(req, emptyParams);
    expect(res.status).toEqual(403);
  });

  it("should allow admin to query organizations", async () => {
    const req = mockRequest();
    const res = await getOrganizations(req, {
      params: Promise.resolve({ organizationId: organization.organizationId }),
    });
    expect(res.status).toEqual(200);
    const data = await res.json();
    expect(data.length).toBeGreaterThan(0);
  });

  it("should reject non-admin from querying organizations", async () => {
    Auth.getServerSession = jest.fn(() => Promise.resolve(mockUserSession));
    const req = mockRequest();
    const res = await getOrganizations(req, {
      params: Promise.resolve({ organizationId: organization.organizationId }),
    });
    expect(res.status).toEqual(403);
  });
});
