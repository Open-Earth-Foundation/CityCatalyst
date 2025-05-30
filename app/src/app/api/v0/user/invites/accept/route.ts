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
  if (!session) {
    throw new createHttpError.Unauthorized("Unauthorized");
  }
  const inviteRequest = AcceptInvite.parse(await req.json());
  const { email, token, cityIds } = inviteRequest;
  const verifiedToken = jwt.verify(
    token,
    process.env.VERIFICATION_TOKEN_SECRET!,
  );
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
    throw new createHttpError.Unauthorized("Unauthorized");
  }

  const invites = await db.models.CityInvite.findAll({
    where: {
      cityId: { [Op.in]: cityIds },
      email,
      status: InviteStatus.PENDING,
    },
  });
  const inviteCityIds = invites.map((i) => i.cityId!);
  const citiesNotFound = difference(cityIds, inviteCityIds);
  if (citiesNotFound.length > 0) {
    logger.error(
      "error in invites/accept/route PATCH: ",
      "City not found",
      citiesNotFound,
    );
    throw createHttpError.Unauthorized("Unauthorized");
  }
  if (!process.env.VERIFICATION_TOKEN_SECRET) {
    logger.error("Need to assign VERIFICATION_TOKEN_SECRET in env!");
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
        logger.error(
          "error in invites/accept/route PATCH: ",
          "error creating invite",
          {
            cityId: invite.cityId,
            email,
          },
        );
        throw new createHttpError.BadRequest("Something went wrong");
      }
      await invite.update({
        status: InviteStatus.ACCEPTED,
        userId: session.user.id,
      });
      return cityUser;
    }),
  );

  const user = await db.models.User.findByPk(session.user.id);
  if (!user) {
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
      throw new createHttpError.InternalServerError("No inventory found");
    }
    await user.update({ defaultInventoryId: inventory.inventoryId });
  }

  return NextResponse.json({ success: failedInvites.length === 0 });
});
