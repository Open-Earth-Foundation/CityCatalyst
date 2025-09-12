/**
 * @swagger
 * /api/v0/user/access-status:
 *   get:
 *     tags:
 *       - User
 *     summary: Get the current user’s access status across resources.
 *     description: Returns a summary of the user’s access and roles across organizations/projects/cities. Requires a signed‑in session. Response is wrapped in { data } with access metadata.
 *     responses:
 *       200:
 *         description: Access status wrapped in data.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   additionalProperties: true
 *       401:
 *         description: Unauthorized.
 *       404:
 *         description: User not found.
 */
import { apiHandler } from "@/util/api";
import createHttpError from "http-errors";
import { db } from "@/models";
import UserService from "@/backend/UserService";
import { NextResponse } from "next/server";

export const GET = apiHandler(async (_req: Request, context) => {
  if (!context.session) {
    throw new createHttpError.Unauthorized("Unauthorized");
  }

  const userId = context.session.user.id;

  const data = await UserService.findUserAccessStatus(userId);
  if (!data) {
    throw new createHttpError.NotFound("User not found");
  }

  return NextResponse.json({ data });
});
