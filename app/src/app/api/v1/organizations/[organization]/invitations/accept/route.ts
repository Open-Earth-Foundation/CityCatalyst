/**
 * @swagger
 * /api/v1/organizations/{organization}/invitations/accept:
 *   patch:
 *     tags:
 *       - organization
 *       - invitations
 *     operationId: patchOrganizationInvitationsAccept
 *     summary: Accept organization admin invitation
 *     description: Accepts an organization admin invitation using a verification token. Validates the token, email, and organization ID, then creates an OrganizationAdmin record and updates the invite status to ACCEPTED. Sends a welcome email to the newly promoted admin. Requires authentication and a valid verification token.
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
 *             required: [email, token, organizationId]
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *               token:
 *                 type: string
 *               organizationId:
 *                 type: string
 *                 format: uuid
 *     responses:
 *       200:
 *         description: Invitation accepted.
 *       401:
 *         description: Unauthorized or token mismatch.
 *       500:
 *         description: Configuration or server error.
 */
import { db } from "@/models";
import { apiHandler } from "@/util/api";
import { AcceptInvite, AcceptOrganizationInvite } from "@/util/validation";
import { randomUUID } from "crypto";
import createHttpError from "http-errors";
import jwt, { JwtPayload } from "jsonwebtoken";
import { Op } from "sequelize";
import { logger } from "@/services/logger";
import { InviteStatus } from "@/util/types";
import { NextResponse } from "next/server";
import EmailService from "@/backend/EmailService";

export const PATCH = apiHandler(async (req, { params, session }) => {
  logger.info({
    params,
    session: session?.user?.id,
  }, "[OrgInviteAccept] PATCH start");
  if (!session) {
    logger.error("[OrgInviteAccept] No session");
    throw new createHttpError.Unauthorized("Unauthorized");
  }
  const inviteRequest = AcceptOrganizationInvite.parse(await req.json());
  logger.info(inviteRequest, "[OrgInviteAccept] Parsed invite request");
  const { email, token, organizationId } = inviteRequest;
  const verifiedToken = jwt.verify(
    token,
    process.env.VERIFICATION_TOKEN_SECRET!,
  );
  logger.info({ email, organizationId }, "[OrgInviteAccept] Token verified");
  const tokenContent = {
    email: (verifiedToken as JwtPayload).email,
    organizationId: (verifiedToken as JwtPayload).organizationId,
  };

  if (
    tokenContent.email !== email ||
    organizationId !== tokenContent.organizationId
  ) {
    logger.error({
      tokenContent,
      email,
      organizationId,
    }, "[OrgInviteAccept] Email or orgId mismatch");
    throw new createHttpError.Unauthorized("Unauthorized");
  }

  const invite = await db.models.OrganizationInvite.findOne({
    where: {
      email,
      status: InviteStatus.PENDING,
      organizationId,
    },
  });
  logger.info({
    found: !!invite,
    organizationId,
  }, "[OrgInviteAccept] Found invite");

  const organization = await db.models.Organization.findByPk(organizationId);
  logger.info({
    found: !!organization,
    organizationId,
  }, "[OrgInviteAccept] Found organization");

  if (!organization) {
    logger.error({ organizationId }, "[OrgInviteAccept] Organization not found");
    throw createHttpError.Unauthorized("Unauthorized");
  }

  if (!process.env.VERIFICATION_TOKEN_SECRET) {
    logger.error("[OrgInviteAccept] VERIFICATION_TOKEN_SECRET missing");
    throw createHttpError.InternalServerError("Configuration error");
  }

  if (session.user.email !== email) {
    logger.error({
      sessionEmail: session.user.email,
      email,
    }, "[OrgInviteAccept] Session email mismatch");
    throw new createHttpError.Unauthorized("Unauthorized");
  }

  const orgAdmin = await db.models.OrganizationAdmin.create({
    organizationAdminId: randomUUID(),
    organizationId: organization.organizationId,
    userId: session.user.id,
  });
  logger.info({
    organizationAdminId: orgAdmin.organizationAdminId,
    userId: session.user.id,
  }, "[OrgInviteAccept] Created OrganizationAdmin");

  await invite?.update({
    status: InviteStatus.ACCEPTED,
    userId: session.user.id,
  });
  logger.info({
    inviteId: invite?.id,
  }, "[OrgInviteAccept] Updated invite status to ACCEPTED");

  const user = await db.models.User.findByPk(session.user.id);
  if (!user) {
    logger.error({
      userId: session.user.id,
    }, "[OrgInviteAccept] No user found");
    throw new createHttpError.InternalServerError("No user found");
  }

  // Send welcome email to the user who accepted the admin invite
  try {
    await EmailService.sendAdminInviteAccepted({
      user,
    });
    logger.info({
      userId: user.userId,
      email: user.email,
    }, "[OrgInviteAccept] Admin invite accepted email sent");
  } catch (error) {
    logger.error(
      {
        err: error,
        userId: user.userId,
        email: user.email,
      },
      "Failed to send admin invite accepted email",
    );
    // Don't throw here - we don't want to fail the invite acceptance if email fails
  }

  logger.info("[OrgInviteAccept] PATCH complete");
  return NextResponse.json(null);
});
