/**
 * @swagger
 * /api/v0/user:
 *   get:
 *     tags:
 *       - User
 *     summary: Get current user info
 *     responses:
 *       200:
 *         description: User info returned.
 *       401:
 *         description: Unauthorized.
 *       404:
 *         description: User not found.
 *   patch:
 *     tags:
 *       - User
 *     summary: Update default inventory and city for current user
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [defaultInventoryId, defaultCityId]
 *             properties:
 *               defaultInventoryId:
 *                 type: string
 *                 format: uuid
 *               defaultCityId:
 *                 type: string
 *                 format: uuid
 *     responses:
 *       200:
 *         description: Defaults updated.
 *       401:
 *         description: Unauthorized.
 *       404:
 *         description: User not found.
 */
import { db } from "@/models";
import { apiHandler } from "@/util/api";
import createHttpError from "http-errors";
import { NextResponse } from "next/server";
import { z } from "zod";
import UserService from "@/backend/UserService";

export const GET = apiHandler(async (_req: Request, context) => {
  if (!context.session) {
    throw new createHttpError.Unauthorized("Unauthorized");
  }

  const user = await db.models.User.findOne({
    attributes: [
      "userId",
      "name",
      "defaultInventoryId",
      "defaultCityId",
      "role",
      "email",
      "title",
      "preferredLanguage",
    ],
    where: {
      userId: context.session.user.id,
    },
  });
  if (!user) {
    throw new createHttpError.NotFound("User not found");
  }

  return NextResponse.json({ data: user });
});

const updateUserRequest = z.object({
  defaultInventoryId: z.string().uuid(),
  defaultCityId: z.string().uuid(),
});

export const PATCH = apiHandler(async (req: Request, context) => {
  const body = updateUserRequest.parse(await req.json());
  if (!context.session) {
    throw new createHttpError.Unauthorized("Unauthorized");
  }

  let inventory;
  try {
    inventory = await UserService.findUserInventory(
      body.defaultInventoryId,
      context.session,
    );
  } catch (error) {
    // we will arrive here if a logged in user attempts to access a public view of an inventory they are not part of.
    // It's not an error, but we don't want to update the user's default inventory in this case.
  }
  if (inventory) {
    const user = await db.models.User.update(
      {
        defaultInventoryId: body.defaultInventoryId,
        defaultCityId: body.defaultCityId,
      },
      {
        where: {
          userId: context.session.user.id,
        },
      },
    );
    if (!user) {
      throw new createHttpError.NotFound("User not found");
    }
  }
  return NextResponse.json({ success: true });
});
