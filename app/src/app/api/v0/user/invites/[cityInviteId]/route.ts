import { db } from "@/models";
import { apiHandler } from "@/util/api";
import createHttpError from "http-errors";
import { NextResponse } from "next/server";
import { CityInviteStatus } from "@/util/types";
import { CityUser } from "@/models/CityUser";

export const DELETE = apiHandler(async (req, { params, session }) => {
  if (!session) {
    throw new createHttpError.Unauthorized("Unauthorized");
  }

  const { cityInviteId } = params;
  const invite = await db.models.CityInvite.findOne({
    where: {
      id: cityInviteId,
      invitingUserId: session.user.id,
    },
  });
  if (!invite) {
    console.error(
      "error in invites/[cityInviteId]/route DELETE: ",
      "CityInvite not found",
      cityInviteId,
    );
    throw createHttpError.Unauthorized("Unauthorized");
  }
  await invite.update({ status: CityInviteStatus.CANCELED });
  const cityUser = await CityUser.findOne({
    where: { cityId: invite.cityId, userId: invite.userId },
  });
  if (cityUser) {
    await cityUser.destroy();
  }
  return NextResponse.json({ success: true });
});

export const PATCH = apiHandler(async (req, { params, session }) => {
  if (!session) {
    throw new createHttpError.Unauthorized("Unauthorized");
  }

  const { cityInviteId } = params;
  const invite = await db.models.CityInvite.findOne({
    where: {
      id: cityInviteId,
      invitingUserId: session.user.id,
    },
  });

  if (!invite) {
    console.error(
      "error in invites/[cityInviteId]/route DELETE: ",
      "CityInvite not found",
      cityInviteId,
    );
    throw createHttpError.Unauthorized("Unauthorized");
  }
  await invite.update({ status: CityInviteStatus.PENDING });
  return NextResponse.json({ success: true });
});
