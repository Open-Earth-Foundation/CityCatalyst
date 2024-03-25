import { db } from "@/models";
import { apiHandler } from "@/util/api";
import createHttpError from "http-errors";
import { NextResponse } from "next/server";

export const GET = apiHandler(async (_req: Request, context) => {
  const userId = context.session?.user.id;
  if (!context.session) {
    throw new createHttpError.Unauthorized("Unauthorized");
  }

  const userFile = await db.models.UserFile.findOne({
    where: {
      id: context.params.file,
      cityId: context.params.city,
    },
  });

  if (!userFile) {
    throw new createHttpError.NotFound("User file not found");
  }

  return NextResponse.json({ data: userFile });
});

export const DELETE = apiHandler(async (_req: Request, context) => {
  const userId = context.session?.user.id;
  if (!context.session) {
    throw new createHttpError.Unauthorized("Unauthorized");
  }

  const userFile = await db.models.UserFile.findOne({
    where: {
      id: context.params.file,
      cityId: context.params.city,
    },
  });

  if (!userFile) {
    throw new createHttpError.NotFound("User file not found");
  }

  await userFile.destroy();

  return NextResponse.json({ data: userFile, deleted: true });
});
