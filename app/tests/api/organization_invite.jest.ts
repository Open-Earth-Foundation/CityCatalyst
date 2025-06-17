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
  GET as getOrganizationInvites,
  POST as createOrganizationInvite,
} from "@/app/api/v0/organizations/[organization]/invitations/route";
import { db } from "@/models";
import { mockRequest, setupTests, testUserID } from "../helpers";
import { Organization } from "@/models/Organization";
import { OrganizationInvite } from "@/models/OrganizationInvite";
import { randomUUID } from "node:crypto";
import { AppSession, Auth } from "@/lib/auth";
import { InviteStatus, OrganizationRole, Roles } from "@/util/types";
import { CreateOrganizationInviteRequest } from "@/util/validation";
import EmailService from "@/backend/EmailService";
import { SentMessageInfo } from "nodemailer"; // Import the correct type

const organizationData = {
  name: "Test Organization - Org Invite Test",
  contactEmail: "test22invitetest@organization.com",
  contactNumber: "1234567890",
};

const inviteData: CreateOrganizationInviteRequest = {
  organizationId: randomUUID(),
  inviteeEmails: ["consultantinvitetest22@example.org"],
  role: OrganizationRole.COLLABORATOR,
};

const mockAdminSession: AppSession = {
  user: { id: testUserID, role: Roles.Admin },
  expires: "1h",
};

const mockUserSession: AppSession = {
  user: { id: testUserID, role: Roles.User },
  expires: "1h",
};

describe("Organization Invitations API", () => {
  let organization: Organization;
  let prevGetServerSession = Auth.getServerSession;

  beforeAll(async () => {
    setupTests();
    await db.initialize();
    EmailService.sendOrganizationInvitationEmail = jest
      .fn<() => Promise<SentMessageInfo>>()
      .mockResolvedValue(true);
  });

  beforeEach(async () => {
    await db.models.Organization.destroy({
      where: { name: organizationData.name },
    });
    Auth.getServerSession = jest.fn(() => Promise.resolve(mockAdminSession));
    organization = await db.models.Organization.create({
      active: true,
      ...organizationData,
      organizationId: inviteData.organizationId,
    });
  });

  afterAll(async () => {
    Auth.getServerSession = prevGetServerSession;
    if (db.sequelize) await db.sequelize.close();
  });

  it("should allow admin to invite a consultant", async () => {
    const req = mockRequest(inviteData);
    const res = await createOrganizationInvite(req, {
      params: Promise.resolve({ organizationId: inviteData.organizationId }),
    });
    expect(res.status).toEqual(200);
    const data = await res.json();
    expect(data.success).toEqual(true);
  });

  it("should reject non-admin from inviting a consultant", async () => {
    Auth.getServerSession = jest.fn(() => Promise.resolve(mockUserSession));
    const req = mockRequest(inviteData);
    const res = await createOrganizationInvite(req, {
      params: Promise.resolve({ organizationId: inviteData.organizationId }),
    });
    expect(res.status).toEqual(403);
  });

  it("should allow admin to fetch all invitations", async () => {
    await OrganizationInvite.create({
      id: randomUUID(),
      organizationId: inviteData.organizationId,
      email: inviteData.inviteeEmails[0],
      role: inviteData.role as OrganizationRole,
      status: InviteStatus.PENDING,
    });

    const req = mockRequest();
    const res = await getOrganizationInvites(req, {
      params: Promise.resolve({ organizationId: inviteData.organizationId }),
    });
    expect(res.status).toEqual(200);
    const data = await res.json();
    expect(data).toHaveLength(1);
    expect(data[0].email).toEqual(inviteData.inviteeEmails[0]);
    expect(data[0].role).toEqual(inviteData.role);
    expect(data[0].status).toEqual(InviteStatus.PENDING);
  });

  it("should reject non-admin from fetching invitations", async () => {
    Auth.getServerSession = jest.fn(() => Promise.resolve(mockUserSession));
    const req = mockRequest();
    const res = await getOrganizationInvites(req, {
      params: Promise.resolve({ organizationId: inviteData.organizationId }),
    });
    expect(res.status).toEqual(403);
  });
});
