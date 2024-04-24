import UserService from "@/backend/UserService";
import { apiHandler } from "@/util/api";
import { fileEndingToMIMEType } from "@/util/helpers";
import createHttpError from "http-errors";
import { NextResponse } from "next/server";

export const GET = apiHandler(async (_req, { params, session }) => {
  if (!session) {
    throw new createHttpError.Unauthorized("Unauthorized");
  }
  const userFile = await UserService.findUserFile(
    params.file,
    params.city,
    session,
  );

  let body: Buffer | undefined = userFile.data;
  let headers: Record<string, string> = {
    "Content-Type": `${
      fileEndingToMIMEType[userFile.fileType || "default"] ||
      "application/x-binary"
    }`,
    "Content-Disposition": `attachment; filename="${userFile.fileName}"`,
  };

  return new NextResponse(body, { headers });
});
