/**
 * @swagger
 * /api/v0/subsector/{subsectorId}:
 *   get:
 *     tags:
 *       - Subsector
 *     summary: Get a subsector record by ID.
 *     description: Public endpoint that fetches a subsector by its identifier. No authentication is enforced. Response is wrapped in { data } containing the subsector fields.
 *     parameters:
 *       - in: path
 *         name: subsectorId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Subsector wrapped in data.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     subsectorId: { type: string, format: uuid }
 *                     subsectorName: { type: string }
 *                     sectorId: { type: string, format: uuid }
 *                     referenceNumber: { type: string }
 *                     scopeId: { type: string, format: uuid }
 *                   additionalProperties: true
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
