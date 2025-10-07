/**
 * @swagger
 * /api/v1/user/invites/{cityInviteId}:
 *   delete:
 *     tags:
 *       - User Invites
 *     summary: Cancel a city invite
 *     parameters:
 *       - in: path
 *         name: cityInviteId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Invite canceled.
 *       401:
 *         description: Unauthorized.
 *   patch:
 *     tags:
 *       - User Invites
 *     summary: Re-send a city invite (reset to pending)
 *     parameters:
 *       - in: path
 *         name: cityInviteId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Invite status updated to pending.
 *       401:
 *         description: Unauthorized.
 */
import { db } from "@/models";
import { apiHandler } from "@/util/api";
import createHttpError from "http-errors";
import { NextResponse } from "next/server";
import { InviteStatus } from "@/util/types";
import { CityUser } from "@/models/CityUser";
import { QueryTypes } from "sequelize";
import UserService from "@/backend/UserService";
import { logger } from "@/services/logger";

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
    logger.error(
      { cityInviteId },
      "error in invites/[cityInviteId]/route DELETE: CityInvite not found"
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
    await UserService.updateDefaults(session.user.id);
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
    logger.error(
      { cityInviteId },
      "error in invites/[cityInviteId]/route DELETE: CityInvite not found"
    );
    throw createHttpError.Unauthorized("Unauthorized");
  }
  await invite.update({ status: InviteStatus.PENDING });
  return NextResponse.json({ success: true });
});
