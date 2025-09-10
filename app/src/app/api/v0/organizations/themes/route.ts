/**
 * @swagger
 * /api/v0/organizations/themes:
 *   get:
 *     tags:
 *       - Organizations
 *     summary: List available themes
 *     responses:
 *       200:
 *         description: Themes returned.
 */
import { apiHandler } from "@/util/api";
import { NextResponse } from "next/server";
import createHttpError from "http-errors";
import { db } from "@/models";

export const GET = apiHandler(async (_req: Request, context) => {
  if (!context.session) {
    throw new createHttpError.Unauthorized("Unauthorized");
  }

  const themes = await db.models.Theme.findAll();

  return NextResponse.json(themes);
});
