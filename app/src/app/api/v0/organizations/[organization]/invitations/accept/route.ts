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

export const PATCH = apiHandler(async (req, { params, session }) => {
  logger.info("[OrgInviteAccept] PATCH start", {
    params,
    session: session?.user?.id,
  });
  if (!session) {
    logger.error("[OrgInviteAccept] No session");
    throw new createHttpError.Unauthorized("Unauthorized");
  }
  const inviteRequest = AcceptOrganizationInvite.parse(await req.json());
  logger.info("[OrgInviteAccept] Parsed invite request", inviteRequest);
  const { email, token, organizationId } = inviteRequest;
  const verifiedToken = jwt.verify(
    token,
    process.env.VERIFICATION_TOKEN_SECRET!,
  );
  logger.info("[OrgInviteAccept] Token verified", { email, organizationId });
  const tokenContent = {
    email: (verifiedToken as JwtPayload).email,
    organizationId: (verifiedToken as JwtPayload).organizationId,
  };

  if (
    tokenContent.email !== email ||
    organizationId !== tokenContent.organizationId
  ) {
    logger.error("[OrgInviteAccept] Email or orgId mismatch", {
      tokenContent,
      email,
      organizationId,
    });
    throw new createHttpError.Unauthorized("Unauthorized");
  }

  const invite = await db.models.OrganizationInvite.findOne({
    where: {
      email,
      status: InviteStatus.PENDING,
      organizationId,
    },
  });
  logger.info("[OrgInviteAccept] Found invite", {
    found: !!invite,
    organizationId,
  });

  const organization = await db.models.Organization.findByPk(organizationId);
  logger.info("[OrgInviteAccept] Found organization", {
    found: !!organization,
    organizationId,
  });

  if (!organization) {
    logger.error("[OrgInviteAccept] Organization not found", {
      organizationId,
    });
    throw createHttpError.Unauthorized("Unauthorized");
  }

  if (!process.env.VERIFICATION_TOKEN_SECRET) {
    logger.error("[OrgInviteAccept] VERIFICATION_TOKEN_SECRET missing");
    throw createHttpError.InternalServerError("Configuration error");
  }

  if (session.user.email !== email) {
    logger.error("[OrgInviteAccept] Session email mismatch", {
      sessionEmail: session.user.email,
      email,
    });
    throw new createHttpError.Unauthorized("Unauthorized");
  }

  const orgAdmin = await db.models.OrganizationAdmin.create({
    organizationAdminId: randomUUID(),
    organizationId: organization.organizationId,
    userId: session.user.id,
  });
  logger.info("[OrgInviteAccept] Created OrganizationAdmin", {
    organizationAdminId: orgAdmin.organizationAdminId,
    userId: session.user.id,
  });

  await invite?.update({
    status: InviteStatus.ACCEPTED,
    userId: session.user.id,
  });
  logger.info("[OrgInviteAccept] Updated invite status to ACCEPTED", {
    inviteId: invite?.id,
  });

  const user = await db.models.User.findByPk(session.user.id);
  if (!user) {
    logger.error("[OrgInviteAccept] No user found", {
      userId: session.user.id,
    });
    throw new createHttpError.InternalServerError("No user found");
  }

  logger.info("[OrgInviteAccept] PATCH complete");
  return NextResponse.json(null);
});
