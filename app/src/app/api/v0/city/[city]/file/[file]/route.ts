import UserService from "@/backend/UserService";
import { apiHandler } from "@/util/api";
import { NextResponse } from "next/server";

export const GET = apiHandler(async (_req: Request, { session, params }) => {
  const userFile = await UserService.findUserFile(
    params.file,
    params.city,
    session,
  );

  return NextResponse.json({ data: userFile });
});

export const DELETE = apiHandler(async (_req: Request, { session, params }) => {
  const userFile = await UserService.findUserFile(
    params.file,
    params.city,
    session,
  );

  await userFile.destroy();
  return NextResponse.json({ data: userFile, deleted: true });
});
