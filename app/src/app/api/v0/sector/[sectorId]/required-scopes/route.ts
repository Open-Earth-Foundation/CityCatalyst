/**
 * @swagger
 * /api/v0/sector/{sectorId}/required-scopes:
 *   get:
 *     tags:
 *       - Sector
 *     summary: Get required scopes for a sector
 *     parameters:
 *       - in: path
 *         name: sectorId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Required scopes returned.
 *       404:
 *         description: Sector not found.
 */
import { db } from "@/models";
import { apiHandler } from "@/util/api";
import createHttpError from "http-errors";
import { NextRequest, NextResponse } from "next/server";
import GPCService from "@/backend/GPCService";
/** this endpoint needs to be reworked because it's returning more scopes than it should. See [ON-2663]**/
export const GET = apiHandler(async (_req: NextRequest, { params }) => {
  const sector = await db.models.Sector.findByPk(params.sectorId);
  if (!sector) {
    throw new createHttpError.NotFound("Sector not found");
  }
  const requiredScopes = await GPCService.getRequiredScopes(params.sectorId);
  return NextResponse.json({ data: requiredScopes });
});
