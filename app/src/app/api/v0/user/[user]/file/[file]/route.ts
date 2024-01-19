import { db } from "@/models";
import { apiHandler } from "@/util/api";
import createHttpError from "http-errors";
import { Session } from "next-auth";
import { NextResponse } from "next/server";

export const GET = apiHandler(
  async (
    _req: Request,
    context: { session?: Session; params: Record<string, string> },
  ) => {
    const userId = context.params.user;
    if (!context.session) {
      throw new createHttpError.Unauthorized("Unauthorized");
    }

    const user = await db.models.User.findOne({
      attributes: ["userId"],
      where: {
        userId: userId,
      },
    });
    if (!user) {
      throw new createHttpError.NotFound("File does not belong to this user");
    }

    const userFile = await db.models.UserFile.findOne({
      where: {
        id: context.params.file,
      },
    });

    if (!userFile) {
      throw new createHttpError.NotFound("User file not found");
    }

    return NextResponse.json({ data: userFile });
  },
);

export const DELETE = apiHandler(
  async (
    _req: Request,
    context: { session?: Session; params: Record<string, string> },
  ) => {
    const userId = context.params.user;
    if (!context.session) {
      throw new createHttpError.Unauthorized("Unauthorized");
    }

    const user = await db.models.User.findOne({
      attributes: ["userId"],
      where: {
        userId: userId,
      },
    });

    if (!user) {
      throw new createHttpError.NotFound("File does not belong to this user");
    }

    const userFile = await db.models.UserFile.findOne({
      where: {
        id: context.params.file,
      },
    });

    if (!userFile) {
      throw new createHttpError.NotFound("User file not found");
    }

    await userFile.destroy();

    return NextResponse.json({ data: userFile, deleted: true });
  },
);
