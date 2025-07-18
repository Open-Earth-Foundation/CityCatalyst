import { OrganizationInvite } from "@/models/OrganizationInvite";
import { Organization } from "@/models/Organization";
import { Op } from "sequelize";
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
import { User } from "@/models/User";
import EmailService from "@/backend/EmailService";
import { logger } from "@/services/logger";
import { OrganizationAdmin } from "@/models/OrganizationAdmin";

export const GET = apiHandler(async (_req, { params, session }) => {
  const { organization: organizationId } = params;
  await UserService.validateIsAdminOrOrgAdmin(session, organizationId);

  const invitations = await OrganizationInvite.findAll({
    where: { organizationId },
  });

  if (!invitations || invitations.length === 0) {
    throw new createHttpError.NotFound("invitations-not-found");
  }

  return NextResponse.json(invitations);
});

export const POST = apiHandler(async (req, { params, session }) => {
  const { organization: organizationId } = params;
  await UserService.validateIsAdminOrOrgAdmin(session, organizationId);
  const validatedData = createOrganizationInviteRequest.parse(await req.json());
  if (validatedData.organizationId !== organizationId) {
    throw new createHttpError.BadRequest("organization-id-mismatch");
  }
  const org = await Organization.findByPk(organizationId);
  if (!org) {
    throw new createHttpError.NotFound("organization-not-found");
  }

  const existingOrgAdmins = await OrganizationAdmin.findAll({
    include: [
      {
        model: User,
        as: "user",
        where: {
          email: {
            [Op.in]: validatedData.inviteeEmails,
          },
        },
      },
    ],
  });

  if (existingOrgAdmins.length > 0) {
    throw new createHttpError.BadRequest(
      `The following users are already admins for another organization: ${existingOrgAdmins
        .map((admin) => admin.user.email)
        .join(", ")}`,
    );
  }

  const failedInvites: { email: string }[] = [];

  await Promise.all(
    validatedData.inviteeEmails.map(async (email) => {
      try {
        const user = await User.findOne({
          where: { email },
        });
        const emailSent = await EmailService.sendOrganizationInvitationEmail(
          {
            email,
            organizationId: validatedData.organizationId,
            role: validatedData.role,
          },
          org,
          user,
        );
        if (!emailSent) {
          throw createHttpError.InternalServerError("email-error");
        }
        let preExistingInvite = await OrganizationInvite.findOne({
          where: { email, organizationId },
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
            email: email as string,
            role: validatedData.role as OrganizationRole,
            status: InviteStatus.PENDING,
          });
        }
        if (!invite) {
          failedInvites.push({ email });
          logger.error(
            `error in organization/${organizationId}/invitations/route POST: `,
            "error creating invite",
            { email, organizationId },
          );
        }
        return invite;
      } catch (e) {
        failedInvites.push({ email });
        logger.error(
          `error in organization/${organizationId}/invitations/route POST: `,
          email,
          e,
        );
      }
    }),
  );

  if (failedInvites.length > 0) {
    throw new createHttpError.InternalServerError(
      `Failed to send invitations to: ${failedInvites.map((f) => f.email).join(", ")}`,
    );
  }
  return NextResponse.json({ success: failedInvites.length === 0 });
});
