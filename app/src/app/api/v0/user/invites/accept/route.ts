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
  logger.info("[UserInviteAccept] PATCH start", {
    params,
    session: session?.user?.id,
  });
  if (!session) {
    logger.error("[UserInviteAccept] No session");
    throw new createHttpError.Unauthorized("Unauthorized");
  }
  const inviteRequest = AcceptInvite.parse(await req.json());
  logger.info("[UserInviteAccept] Parsed invite request", inviteRequest);
  const { email, token, cityIds } = inviteRequest;
  const verifiedToken = jwt.verify(
    token,
    process.env.VERIFICATION_TOKEN_SECRET!,
  );
  logger.info("[UserInviteAccept] Token verified", { email, cityIds });
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
    logger.error("[UserInviteAccept] Email or city mismatch", {
      tokenContent,
      email,
      cityIds,
    });
    throw new createHttpError.Unauthorized("Unauthorized");
  }

  const invites = await db.models.CityInvite.findAll({
    where: {
      cityId: { [Op.in]: cityIds },
      email,
      status: InviteStatus.PENDING,
    },
  });
  logger.info("[UserInviteAccept] Found invites", {
    count: invites.length,
    cityIds,
  });
  const inviteCityIds = invites.map((i) => i.cityId!);
  const citiesNotFound = difference(cityIds, inviteCityIds);
  if (citiesNotFound.length > 0) {
    logger.error("[UserInviteAccept] City not found in invites", {
      citiesNotFound,
    });
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
        logger.error("[UserInviteAccept] Error creating CityUser", {
          cityId: invite.cityId,
          email,
        });
        throw new createHttpError.BadRequest("Something went wrong");
      }
      logger.info("[UserInviteAccept] Created CityUser", {
        cityId: invite.cityId,
        userId: session.user.id,
      });
      await invite.update({
        status: InviteStatus.ACCEPTED,
        userId: session.user.id,
      });
      logger.info("[UserInviteAccept] Updated invite status to ACCEPTED", {
        cityId: invite.cityId,
      });
      return cityUser;
    }),
  );

  const user = await db.models.User.findByPk(session.user.id);
  if (!user) {
    logger.error("[UserInviteAccept] No user found", {
      userId: session.user.id,
    });
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
      logger.error("[UserInviteAccept] No inventory found", { cityIds });
      throw new createHttpError.InternalServerError("No inventory found");
    }
    await user.update({ defaultInventoryId: inventory.inventoryId });
    logger.info("[UserInviteAccept] Updated user defaultInventoryId", {
      userId: user.userId,
      inventoryId: inventory.inventoryId,
    });
  }

  logger.info("[UserInviteAccept] PATCH complete", {
    failedInvites: failedInvites.length,
  });
  return NextResponse.json({ success: failedInvites.length === 0 });
});
