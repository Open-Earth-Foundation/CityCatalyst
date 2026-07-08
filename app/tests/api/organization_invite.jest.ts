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
} from "@/app/api/v1/organizations/[organization]/invitations/route";
import { db } from "@/models";
import {
  expectStatusCode,
  mockRequest,
  setupTests,
  testUserID,
} from "../helpers";
import { OrganizationInvite } from "@/models/OrganizationInvite";
import { randomUUID } from "node:crypto";
import { AppSession, Auth } from "@/lib/auth";
import { InviteStatus, OrganizationRole, Roles } from "@/util/types";
import { CreateOrganizationInviteRequest } from "@/util/validation";
import EmailService from "@/backend/EmailService";

const TEST_INVITE_URL =
  "http://localhost:3000/cities/onboarding?organizationId=test&token=test&email=test&role=test";

const organizationData = {
  name: "Test Organization - Org Invite Test",
  active: true,
  contactEmail: "test22invitetest@organization.com",
  contactNumber: "1234567890",
};

const inviteData: CreateOrganizationInviteRequest = {
  organizationId: "5e6f0b5a-0d1b-4fc3-bf4b-c5c05a36a7e4",
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
  let prevGetServerSession = Auth.getServerSession;

  beforeAll(async () => {
    setupTests();
    await db.initialize();
    EmailService.sendOrganizationInvitationEmail = jest
      .fn<() => Promise<{ success: boolean; inviteUrl: string }>>()
      .mockResolvedValue({
        success: true,
        inviteUrl: TEST_INVITE_URL,
      });
  });

  beforeEach(async () => {
    await db.models.Organization.destroy({
      where: { name: organizationData.name },
    });
    Auth.getServerSession = jest.fn(() => Promise.resolve(mockAdminSession));
    await db.models.Organization.create({
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
      params: Promise.resolve({ organization: inviteData.organizationId }),
    });

    await expectStatusCode(res, 200);
    const data = await res.json();
    expect(data.success).toEqual(true);
    expect(data.inviteUrls).toBeDefined();
    expect(typeof data.inviteUrls).toBe("object");
  });

  it("should store the invite with a lowercase email", async () => {
    const mixedCaseEmail = "MixedCase@Example.ORG";
    const req = mockRequest({
      ...inviteData,
      inviteeEmails: [mixedCaseEmail],
    });
    const res = await createOrganizationInvite(req, {
      params: Promise.resolve({ organization: inviteData.organizationId }),
    });

    await expectStatusCode(res, 200);

    const stored = await db.models.OrganizationInvite.findOne({
      where: { organizationId: inviteData.organizationId },
    });
    expect(stored?.email).toEqual(mixedCaseEmail.toLowerCase());

    const data = await res.json();
    expect(data.inviteUrls[mixedCaseEmail.toLowerCase()]).toBeDefined();
  });

  it("should still return an invite URL when the email send fails", async () => {
    EmailService.sendOrganizationInvitationEmail = jest
      .fn<() => Promise<{ success: boolean; inviteUrl: string }>>()
      .mockResolvedValue({
        success: false,
        inviteUrl: TEST_INVITE_URL,
      });

    const req = mockRequest(inviteData);
    const res = await createOrganizationInvite(req, {
      params: Promise.resolve({ organization: inviteData.organizationId }),
    });

    await expectStatusCode(res, 200);
    const data = await res.json();
    expect(data.success).toEqual(true);
    expect(data.inviteUrls[inviteData.inviteeEmails[0]]).toBeDefined();

    // The invite record must exist even though email was not sent.
    const stored = await db.models.OrganizationInvite.findOne({
      where: {
        email: inviteData.inviteeEmails[0],
        organizationId: inviteData.organizationId,
      },
    });
    expect(stored).not.toBeNull();
    expect(stored?.status).toEqual(InviteStatus.PENDING);

    // Restore mock for following tests
    EmailService.sendOrganizationInvitationEmail = jest
      .fn<() => Promise<{ success: boolean; inviteUrl: string }>>()
      .mockResolvedValue({ success: true, inviteUrl: TEST_INVITE_URL });
  });

  it("should reject non-admin from inviting a consultant", async () => {
    Auth.getServerSession = jest.fn(() => Promise.resolve(mockUserSession));
    const req = mockRequest(inviteData);
    const res = await createOrganizationInvite(req, {
      params: Promise.resolve({ organization: inviteData.organizationId }),
    });
    await expectStatusCode(res, 403);
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
      params: Promise.resolve({ organization: inviteData.organizationId }),
    });
    await expectStatusCode(res, 200);
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
      params: Promise.resolve({ organization: inviteData.organizationId }),
    });
    await expectStatusCode(res, 403);
  });
});
