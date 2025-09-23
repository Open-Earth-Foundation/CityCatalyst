/**
 * @swagger
 * /api/v0/organizations/themes:
 *   get:
 *     tags:
 *       - Organizations
 *     summary: List available branding themes.
 *     description: Returns the list of themes that can be assigned to organizations. Requires a signed‑in session. Response is an array of theme objects (not wrapped).
 *     responses:
 *       200:
 *         description: Array of themes.
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   themeId: { type: string, format: uuid }
 *                   themeKey: { type: string }
 *                   primaryColor: { type: string }
 *                   created: { type: string, format: date-time }
 *                   lastUpdated: { type: string, format: date-time }
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
