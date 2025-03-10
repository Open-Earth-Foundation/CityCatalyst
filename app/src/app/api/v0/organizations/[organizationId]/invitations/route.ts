import { OrganizationInvite } from "@/models/OrganizationInvite";
import { Organization } from "@/models/Organization";
import { createOrganizationInviteRequest } from "@/util/validation";
import { apiHandler } from "@/util/api";
import { NextResponse } from "next/server";
import createHttpError from "http-errors";
import UserService from "@/backend/UserService";
import { randomUUID } from "node:crypto";
import { InviteStatus, OrganizationRole } from "@/util/types";

export const GET = apiHandler(async (_req, { params, session }) => {
  UserService.validateIsOefAdmin(session);
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
  UserService.validateIsOefAdmin(session);
  const { organizationId } = params;
  const validatedData = createOrganizationInviteRequest.parse(await req.json());
  if (validatedData.organizationId !== organizationId) {
    throw new createHttpError.BadRequest("organization-id-mismatch");
  }
  const org = await Organization.findByPk(organizationId);
  if (!org) {
    throw new createHttpError.NotFound("organization-not-found");
  }

  await OrganizationInvite.create({
    id: randomUUID(),
    organizationId: validatedData.organizationId,
    email: validatedData.inviteeEmail as string,
    role: validatedData.role as OrganizationRole,
    status: InviteStatus.PENDING,
  });

  return NextResponse.json({
    message: `invitation-sent-successfully`,
  });
});
