/**
 * @swagger
 * /api/v1/organizations/{organization}/invitations:
 *   get:
 *     tags:
 *       - organization
 *       - invitations
 *     operationId: getOrganizationInvitations
 *     summary: List organization invitations
 *     description: Retrieves all invitations for an organization, including pending, accepted, and declined invitations. Returns invitation details including email, role, status, and timestamps. Requires admin or organization admin privileges.
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
 */

import { OrganizationInvite } from "@/models/OrganizationInvite";
import { Organization } from "@/models/Organization";

import { createOrganizationInviteRequest } from "@/util/validation";
import { apiHandler } from "@/util/api";
import { NextResponse } from "next/server";
import createHttpError from "http-errors";
import UserService from "@/backend/UserService";
import { randomUUID } from "node:crypto";
import { InviteStatus, OrganizationRole } from "@/util/types";
import { User } from "@/models/User";
import EmailService from "@/backend/EmailService";
import { logger } from "@/services/logger";

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

/**
 * @swagger
 * /api/v1/organizations/{organization}/invitations:
 *   post:
 *     tags:
 *       - organization
 *       - invitations
 *     operationId: postOrganizationInvitations
 *     summary: Invite users to an organization
 *     description: Sends organization admin invitations to one or more email addresses. Creates or updates invitation records and sends invitation emails with verification tokens. Prevents inviting users who are already organization admins. Returns success status and invite URLs. Requires admin or organization admin privileges.
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

  const failedInvites: { email: string }[] = [];
  const inviteUrls: Record<string, string> = {};

  await Promise.all(
    validatedData.inviteeEmails.map(async (email) => {
      const normalizedEmail = email.toLowerCase();
      try {
        const user = await User.findOne({
          where: { email: normalizedEmail },
        });

        // Create or update invite BEFORE attempting to send email so the
        // invite URL is always available even when SMTP is unavailable.
        const preExistingInvite = await OrganizationInvite.findOne({
          where: { email: normalizedEmail, organizationId },
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
            email: normalizedEmail,
            role: validatedData.role as OrganizationRole,
            status: InviteStatus.PENDING,
          });
        }

        if (!invite) {
          failedInvites.push({ email: normalizedEmail });
          logger.error(
            { email: normalizedEmail, organizationId },
            `error creating invite in organization/${organizationId}/invitations/route POST`,
          );
          return;
        }

        // Send invitation email — non-fatal so the invite URL is still
        // returned to the admin when SMTP is unavailable.
        const emailResult = await EmailService.sendOrganizationInvitationEmail(
          {
            email: normalizedEmail,
            organizationId: validatedData.organizationId,
            role: validatedData.role,
          },
          org,
          user,
        );

        if (!emailResult.success) {
          logger.warn(
            { email: normalizedEmail, organizationId },
            "Invitation email could not be sent; invite was created and URL is available",
          );
        }

        inviteUrls[normalizedEmail] = emailResult.inviteUrl;
        return invite;
      } catch (e) {
        failedInvites.push({ email: normalizedEmail });
        logger.error(
          { err: e, email: normalizedEmail, organizationId },
          `error in organization/${organizationId}/invitations/route POST`,
        );
      }
    }),
  );

  if (failedInvites.length > 0) {
    throw new createHttpError.InternalServerError(
      `Failed to create invitations for: ${failedInvites.map((f) => f.email).join(", ")}`,
    );
  }
  return NextResponse.json({
    success: failedInvites.length === 0,
    inviteUrls: inviteUrls,
  });
});
