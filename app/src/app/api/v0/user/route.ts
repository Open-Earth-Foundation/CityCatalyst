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
    attributes: ["userId", "name", "defaultInventoryId", "role", "email"],
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
    const user = await db.models.User.update(body, {
      where: {
        userId: context.session.user.id,
      },
    });
    if (!user) {
      throw new createHttpError.NotFound("User not found");
    }
  }
  return NextResponse.json({ success: true });
});
