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
  if (!session) {
    throw new createHttpError.Unauthorized("Unauthorized");
  }
  const inviteRequest = AcceptOrganizationInvite.parse(await req.json());
  const { email, token, organizationId } = inviteRequest;
  const verifiedToken = jwt.verify(
    token,
    process.env.VERIFICATION_TOKEN_SECRET!,
  );
  const tokenContent = {
    email: (verifiedToken as JwtPayload).email,
    organizationId: (verifiedToken as JwtPayload).organizationId,
  };

  if (
    tokenContent.email !== email ||
    organizationId !== tokenContent.organizationId
  ) {
    throw new createHttpError.Unauthorized("Unauthorized");
  }

  const invite = await db.models.OrganizationInvite.findOne({
    where: {
      email,
      status: InviteStatus.PENDING,
      organizationId,
    },
  });

  const organization = await db.models.Organization.findByPk(organizationId);

  if (!organization) {
    console.error("Organization not found");
    throw createHttpError.Unauthorized("Unauthorized");
  }

  if (!process.env.VERIFICATION_TOKEN_SECRET) {
    console.error("Need to assign VERIFICATION_TOKEN_SECRET in env!");
    throw createHttpError.InternalServerError("Configuration error");
  }

  if (session.user.email !== email) {
    throw new createHttpError.Unauthorized("Unauthorized");
  }

  const orgAdmin = await db.models.OrganizationAdmin.create({
    organizationAdminId: randomUUID(),
    organizationId: organization.organizationId,
    userId: session.user.id,
  });

  await invite?.update({
    status: InviteStatus.ACCEPTED,
    userId: session.user.id,
  });

  const user = await db.models.User.findByPk(session.user.id);
  if (!user) {
    throw new createHttpError.InternalServerError("No user found");
  }

  return NextResponse.json(null);
});
