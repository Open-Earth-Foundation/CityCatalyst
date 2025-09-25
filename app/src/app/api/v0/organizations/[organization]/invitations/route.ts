/**
 * @swagger
 * /api/v0/organizations/{organization}/invitations:
 *   get:
 *     tags:
 *       - Organization Invitations
 *     summary: List organization invitations
 *     parameters:
 *       - in: path
 *         name: organization
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Invitations returned.
 *       404:
 *         description: Invitations not found.
 *   post:
 *     tags:
 *       - Organization Invitations
 *     summary: Invite users to an organization
 *     parameters:
 *       - in: path
 *         name: organization
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [organizationId, inviteeEmails, role]
 *             properties:
 *               organizationId:
 *                 type: string
 *                 format: uuid
 *               inviteeEmails:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: email
 *               role:
 *                 type: string
 *     responses:
 *       200:
 *         description: Invitations sent.
 *       400:
 *         description: Organization ID mismatch or invalid input.
 *       404:
 *         description: Organization not found.
 *       500:
 *         description: Failed to send some invitations.
 */
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
import { CustomInviteError, InviteErrorCodes } from "@/lib/custom-errors/custom-invite-error";

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
    throw new CustomInviteError({
      errorKey: InviteErrorCodes.USER_ALREADY_ORG_ADMIN,
      emails: existingOrgAdmins.map((admin) => admin.user.email).filter((email): email is string => !!email),
      message: "user-already-org-admin",
    });
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
            { email, organizationId },
            `error in organization/${organizationId}/invitations/route POST`
          );
        }
        return invite;
      } catch (e) {
        failedInvites.push({ email });
        logger.error(
          { err: e, email, organizationId },
          `error in organization/${organizationId}/invitations/route POST`
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
