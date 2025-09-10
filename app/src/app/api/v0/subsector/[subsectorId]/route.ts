/**
 * @swagger
 * /api/v0/subsector/{subsectorId}:
 *   get:
 *     tags:
 *       - Subsector
 *     summary: Get subsector by ID
 *     parameters:
 *       - in: path
 *         name: subsectorId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Subsector returned.
 *       404:
 *         description: Subsector not found.
 */
import { db } from "@/models";
import { apiHandler } from "@/util/api";
import createHttpError from "http-errors";
import { NextRequest, NextResponse } from "next/server";

export const GET = apiHandler(async (_req: NextRequest, { params }) => {
  const subsector = await db.models.SubSector.findByPk(params.subsectorId);
  if (!subsector) {
    throw new createHttpError.NotFound("Subsector not found");
  }

  return NextResponse.json({ data: subsector });
});
