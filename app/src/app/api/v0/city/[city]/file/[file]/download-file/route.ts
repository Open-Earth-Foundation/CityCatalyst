/**
 * @swagger
 * /api/v0/city/{city}/file/{file}/download-file:
 *   get:
 *     tags:
 *       - City Files
 *     summary: Download a city file by ID
 *     parameters:
 *       - in: path
 *         name: city
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: path
 *         name: file
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Binary file stream.
 *       401:
 *         description: Unauthorized.
 */
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
