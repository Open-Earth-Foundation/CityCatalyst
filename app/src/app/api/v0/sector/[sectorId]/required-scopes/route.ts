/**
 * @swagger
 * /api/v0/sector/{sectorId}/required-scopes:
 *   get:
 *     tags:
 *       - Sector
 *     summary: List required GPC scopes for a sector.
 *     description: Returns the distinct scope names used by subcategories within the sector. Public endpoint (no authentication enforced). Response is wrapped in { data: { requiredScopes: string[] } }.
 *     parameters:
 *       - in: path
 *         name: sectorId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Required scopes wrapped in data.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     requiredScopes:
 *                       type: array
 *                       items: { type: string }
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
