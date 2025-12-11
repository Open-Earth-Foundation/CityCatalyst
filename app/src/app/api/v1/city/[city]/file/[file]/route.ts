/**
 * @swagger
 * /api/v1/city/{city}/file/{file}:
 *   get:
 *     tags:
 *       - city
         - Files
 *     operationId: getCityFile
 *     summary: Get a single uploaded city file by ID.
 *     description: Returns the stored file metadata for the given city and file ID. Requires a signed‑in user with access to the city. Response is wrapped in '{' data '}'.
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
 *         description: File metadata wrapped in data.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     fileId:
 *                       type: string
 *                       format: uuid
 *                     fileName:
 *                       type: string
 *                     size:
 *                       type: number
 *                     fileType:
 *                       type: string
 *                     uploadDate:
 *                       type: string
 *                       format: date-time
 *                     content:
 *                       type: string
 *                       description: File content as base64 or URL
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

/**
 * @swagger
 * /api/v1/city/{city}/file/{file}:
 *   delete:
 *     tags:
 *       - city
         - Files
 *     operationId: deleteCityFile
 *     summary: Delete an uploaded city file by ID.
 *     description: Removes the file metadata record. Requires a signed‑in user with access to the city. Returns the deleted record in { data } and a deleted flag.
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
 *         description: Deleted file wrapped in data with deleted flag.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                 deleted:
 *                   type: boolean
 */
export const DELETE = apiHandler(async (_req: Request, { session, params }) => {
  const userFile = await UserService.findUserFile(
    params.file,
    params.city,
    session,
  );

  await userFile.destroy();
  return NextResponse.json({ data: userFile, deleted: true });
});
