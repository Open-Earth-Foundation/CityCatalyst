/**
 * @swagger
 * /api/v0/modules:
 *   get:
 *     tags:
 *       - Modules
 *     summary: List all available modules with localized metadata.
 *     description: Public endpoint that retrieves every configured module record. No authentication is required. Response is wrapped in { data: Module[] } including localized fields.
 *     responses:
 *       200:
 *         description: Modules wrapped in data.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id: { type: string, format: uuid }
 *                       stage: { type: string }
 *                       name: { type: object, additionalProperties: { type: string } }
 *                       description: { type: object, additionalProperties: { type: string } }
 *                       tagline: { type: object, additionalProperties: { type: string } }
 *                       type: { type: string }
 *                       author: { type: string }
 *                       url: { type: string }
 *                       created: { type: string, format: date-time }
 *                       last_updated: { type: string, format: date-time }
 */
import { db } from "@/models";
import { apiHandler } from "@/util/api";
import { NextResponse } from "next/server";

export const GET = apiHandler(async (_req: Request) => {
  const modules = await db.models.Module.findAll();
  return NextResponse.json({ data: modules });
});
