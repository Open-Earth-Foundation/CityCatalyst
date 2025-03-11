import { OrganizationInvite } from "@/models/OrganizationInvite";
import { Organization } from "@/models/Organization";
import {
  CreateOrganizationInviteRequest,
  createOrganizationInviteRequest,
} from "@/util/validation";
import { apiHandler } from "@/util/api";
import { NextResponse } from "next/server";
import createHttpError from "http-errors";
import UserService from "@/backend/UserService";
import { randomUUID } from "node:crypto";
import jwt from "jsonwebtoken";
import { InviteStatus, OrganizationRole } from "@/util/types";
import InviteToOrganizationTemplate from "@/lib/emails/InviteToOrganizationTemplate";
import { render } from "@react-email/components";
import { sendEmail } from "@/lib/email";
import { User } from "@/models/User";
import EmailService from "@/backend/EmailService";

export const GET = apiHandler(async (_req, { params, session }) => {
  UserService.validateIsAdmin(session);
  const { organizationId } = params;

  const invitations = await OrganizationInvite.findAll({
    where: { organizationId },
  });

  if (!invitations) {
    throw new createHttpError.NotFound("invitations-not-found");
  }

  return NextResponse.json(invitations);
});

export const POST = apiHandler(async (req, { params, session }) => {
  UserService.validateIsAdmin(session);
  const { organizationId } = params;
  const validatedData = createOrganizationInviteRequest.parse(await req.json());
  if (validatedData.organizationId !== organizationId) {
    throw new createHttpError.BadRequest("organization-id-mismatch");
  }
  const org = await Organization.findByPk(organizationId);
  if (!org) {
    throw new createHttpError.NotFound("organization-not-found");
  }
  const user = await User.findOne({
    where: { email: validatedData.inviteeEmail },
  });
  const emailSent = await EmailService.sendOrganizationInvitationEmail(
    validatedData,
    org,
    user,
  );
  if (!emailSent) {
    throw createHttpError.InternalServerError("email-error");
  }
  let preExistingInvite = await OrganizationInvite.findOne({
    where: { email: validatedData.inviteeEmail, organizationId },
  });
  let invite;
  if (preExistingInvite) {
    if (preExistingInvite.status !== InviteStatus.ACCEPTED) {
      await preExistingInvite.update({
        status: InviteStatus.PENDING,
      });
    }
    invite = preExistingInvite;
  } else {
    invite = await OrganizationInvite.create({
      id: randomUUID(),
      organizationId: validatedData.organizationId,
      email: validatedData.inviteeEmail as string,
      role: validatedData.role as OrganizationRole,
      status: InviteStatus.PENDING,
    });
  }
  return NextResponse.json(invite);
});
