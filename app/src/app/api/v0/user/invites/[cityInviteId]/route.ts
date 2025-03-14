import { db } from "@/models";
import { apiHandler } from "@/util/api";
import createHttpError from "http-errors";
import { NextResponse } from "next/server";
import { InviteStatus } from "@/util/types";
import { CityUser } from "@/models/CityUser";
import { QueryTypes } from "sequelize";
import UserService from "@/backend/UserService";

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

  await invite.update({ status: InviteStatus.CANCELED });
  const cityUser = await CityUser.findOne({
    where: { cityId: invite.cityId, userId: invite.userId },
  });
  const [isDefaultCity] = await db.sequelize!.query(
    `
        select "User".default_inventory_id
        from "User"
                 join "Inventory" i on "User".default_inventory_id = i.inventory_id
                 join "CityUser" cu on "User".user_id = cu.user_id and cu.city_id = i.city_id
        where cu.city_id = :cityId and cu.user_id = :userId`,
    {
      replacements: { cityId: invite.cityId, userId: invite.userId },
      type: QueryTypes.SELECT,
    },
  );
  if (isDefaultCity) {
    await UserService.updateDefaultInventoryId(session.user.id);
  }
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
  await invite.update({ status: InviteStatus.PENDING });
  return NextResponse.json({ success: true });
});
