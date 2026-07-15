/**
 * @swagger
 * /api/v1/user/invites/accept:
 *   patch:
 *     tags:
 *       - user
 *       - invites
 *     operationId: patchUserInvitesAccept
 *     summary: Accept invites to join cities
 *     description: Accepts one or more city invitations using a verification token. Validates the token and email, creates CityUser relationships for each accepted invite, and updates invite statuses to ACCEPTED. If the user has no default inventory, sets the first available inventory from the accepted cities as the default. Requires authentication and valid verification tokens.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, token, cityIds]
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *               token:
 *                 type: string
 *               cityIds:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: uuid
 *     responses:
 *       200:
 *         description: Invites accepted and membership created.
 *       401:
 *         description: Unauthorized or invalid token.
 *       500:
 *         description: Server or configuration error.
 */
import { db } from "@/models";
import { apiHandler } from "@/util/api";
import { AcceptInvite } from "@/util/validation";
import { randomUUID } from "crypto";
import createHttpError from "http-errors";
import jwt, { JwtPayload } from "jsonwebtoken";
import { Op } from "sequelize";
import { logger } from "@/services/logger";
import { InviteStatus } from "@/util/types";
import { NextResponse } from "next/server";
import { ProjectAdmin } from "@/models/ProjectAdmin";

export const PATCH = apiHandler(async (req, { params, session }) => {
  logger.info({
    params,
    session: session?.user?.id,
  }, "[UserInviteAccept] PATCH start");
  if (!session) {
    logger.error("[UserInviteAccept] No session");
    throw new createHttpError.Unauthorized("Unauthorized");
  }
  const inviteRequest = AcceptInvite.parse(await req.json());
  logger.info(inviteRequest, "[UserInviteAccept] Parsed invite request");
  const { email, token, cityIds } = inviteRequest;
  const verifiedToken = jwt.verify(
    token,
    process.env.VERIFICATION_TOKEN_SECRET!,
  );
  logger.info({ email, cityIds }, "[UserInviteAccept] Token verified");
  const tokenContent = {
    email: (verifiedToken as JwtPayload).email,
    cities: (verifiedToken as JwtPayload).cities,
    role: (verifiedToken as JwtPayload).role as "admin" | "collaborator" | undefined,
    projectId: (verifiedToken as JwtPayload).projectId as string | undefined,
  };

  const difference = (setA: string[], setB: string[]) =>
    setA.filter((x) => !setB.includes(x));

  if (
    tokenContent.email !== email ||
    difference(cityIds, tokenContent.cities).length > 0
  ) {
    logger.error({
      tokenContent,
      email,
      cityIds,
    }, "[UserInviteAccept] Email or city mismatch");
    throw new createHttpError.Unauthorized("Unauthorized");
  }

  const invites = await db.models.CityInvite.findAll({
    where: {
      cityId: { [Op.in]: cityIds },
      email,
      status: InviteStatus.PENDING,
    },
  });
  logger.info({
    count: invites.length,
    cityIds,
  }, "[UserInviteAccept] Found invites");
  const inviteCityIds = invites.map((i) => i.cityId!);
  const citiesNotFound = difference(cityIds, inviteCityIds);
  if (citiesNotFound.length > 0) {
    logger.error({
      citiesNotFound,
    }, "[UserInviteAccept] City not found in invites");
    throw createHttpError.Unauthorized("Unauthorized");
  }
  if (!process.env.VERIFICATION_TOKEN_SECRET) {
    logger.error("[UserInviteAccept] VERIFICATION_TOKEN_SECRET missing");
    throw createHttpError.InternalServerError("Configuration error");
  }
  const failedInvites: { cityId: string }[] = [];

  if (tokenContent.role === "admin" && tokenContent.projectId) {
    const [projectAdmin, created] = await ProjectAdmin.findOrCreate({
      where: { projectId: tokenContent.projectId, userId: session.user.id },
      defaults: {
        projectAdminId: randomUUID(),
        projectId: tokenContent.projectId,
        userId: session.user.id,
      },
    });
    logger.info(
      { projectId: tokenContent.projectId, userId: session.user.id, created },
      created
        ? "[UserInviteAccept] Created ProjectAdmin"
        : "[UserInviteAccept] ProjectAdmin already exists; continuing accept",
    );
    await Promise.all(
      invites.map((invite) =>
        invite.update({ status: InviteStatus.ACCEPTED, userId: session.user.id }),
      ),
    );
  } else {
    await Promise.all(
      invites.map(async (invite) => {
        const [cityUser, created] = await db.models.CityUser.findOrCreate({
          where: {
            cityId: invite.cityId,
            userId: session.user.id,
          },
          defaults: {
            cityUserId: randomUUID(),
            cityId: invite.cityId!,
            userId: session.user.id,
          },
        });
        logger.info(
          {
            cityId: invite.cityId,
            userId: session.user.id,
            cityUserId: cityUser.cityUserId,
            created,
          },
          created
            ? "[UserInviteAccept] Created CityUser"
            : "[UserInviteAccept] CityUser already exists; continuing accept",
        );
        await invite.update({
          status: InviteStatus.ACCEPTED,
          userId: session.user.id,
        });
        logger.info({ cityId: invite.cityId }, "[UserInviteAccept] Updated invite status to ACCEPTED");
        return cityUser;
      }),
    );
  }

  const user = await db.models.User.findByPk(session.user.id);
  if (!user) {
    logger.error({ userId: session.user.id }, "[UserInviteAccept] No user found");
    throw new createHttpError.InternalServerError("No user found");
  }
  if (!user.defaultInventoryId) {
    const inventory = await db.models.Inventory.findOne({
      where: {
        cityId: {
          [Op.in]: cityIds,
        },
      },
    });
    if (!inventory) {
      logger.error({ cityIds }, "[UserInviteAccept] No inventory found");
      throw new createHttpError.InternalServerError("No inventory found");
    }
    await user.update({
      defaultInventoryId: inventory.inventoryId,
      defaultCityId: inventory.cityId,
    });
    logger.info({
      userId: user.userId,
      inventoryId: inventory.inventoryId,
    }, "[UserInviteAccept] Updated user defaultInventoryId and defaultCityId");
  }

  logger.info({ failedInvites: failedInvites.length }, "[UserInviteAccept] PATCH complete");
  return NextResponse.json({ success: failedInvites.length === 0 });
});
