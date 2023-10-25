import { db } from "@/models";
import { apiHandler } from "@/util/api";
import createHttpError from "http-errors";
import { Session } from "next-auth";
import { NextResponse } from "next/server";
import { z } from "zod";

export const GET = apiHandler(
  async (
    _req: Request,
    context: { session?: Session; params: Record<string, string> },
  ) => {
    if (!context.session) {
      throw new createHttpError.Unauthorized("Unauthorized");
    }

    const user = await db.models.User.findOne({
      attributes: [
        "userId",
        "name",
        "defaultCityLocode",
        "defaultInventoryYear",
      ],
      where: {
        userId: context.session.user.id,
      },
    });
    if (!user) {
      throw new createHttpError.NotFound("User not found");
    }

    return NextResponse.json({ data: user });
  },
);

const updateUserRequest = z.object({
  defaultCityLocode: z.string().min(2),
  defaultInventoryYear: z.number().gt(0),
});

export const PATCH = apiHandler(
  async (
    req: Request,
    context: { session?: Session; params: Record<string, string> },
  ) => {
    const body = updateUserRequest.parse(await req.json());
    if (!context.session) {
      throw new createHttpError.Unauthorized("Unauthorized");
    }

    const user = await db.models.User.update(body, {
      where: {
        userId: context.session.user.id,
      },
    });
    if (!user) {
      throw new createHttpError.NotFound("User not found");
    }

    return NextResponse.json({ success: true });
  },
);
