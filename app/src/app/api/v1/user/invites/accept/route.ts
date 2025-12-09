/**
 * @swagger
 * /api/v1/user/invites/accept:
 *   patch:
 *     tags:
 *       - User Invites
 *     operationId: patchUserInvitesAccept
 *     summary: Accept invites to join cities
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
  await Promise.all(
    invites.map(async (invite) => {
      const cityUser = await db.models.CityUser.create({
        cityUserId: randomUUID(),
        cityId: invite.cityId,
        userId: session.user.id,
      });
      if (!cityUser) {
        failedInvites.push({ cityId: invite.cityId! });
        logger.error({
          cityId: invite.cityId,
          email,
        }, "[UserInviteAccept] Error creating CityUser");
        throw new createHttpError.BadRequest("Something went wrong");
      }
      logger.info({ cityId: invite.cityId, userId: session.user.id }, "[UserInviteAccept] Created CityUser");
      await invite.update({
        status: InviteStatus.ACCEPTED,
        userId: session.user.id,
      });
      logger.info({ cityId: invite.cityId }, "[UserInviteAccept] Updated invite status to ACCEPTED");
      return cityUser;
    }),
  );

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