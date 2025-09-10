/**
 * @swagger
 * /api/v0/city/{city}/file/{file}:
 *   get:
 *     tags:
 *       - City Files
 *     summary: Get a city file by ID
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
 *         description: File metadata returned.
 *   delete:
 *     tags:
 *       - City Files
 *     summary: Delete a city file by ID
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
 *         description: File deleted.
 */
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
