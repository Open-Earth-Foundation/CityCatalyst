/**
 * @swagger
 * /api/v0/user/cities/{id}/results:
 *   get:
 *     tags:
 *       - User
 *     summary: Get year‑over‑year emissions results for a user’s city.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Results wrapped in data.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     cityId:
 *                       type: string
 *                       format: uuid
 *                     inventoryId:
 *                       type: string
 *                       format: uuid
 *                     year:
 *                       type: number
 *                     totalEmissions:
 *                       type: number
 *                     sectorResults:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           sectorId:
 *                             type: string
 *                             format: uuid
 *                           sectorName:
 *                             type: string
 *                           emissions:
 *                             type: number
 *       404:
 *         description: City not found.
 */
// return the year over year statistics for inventories attached to the city for this user

import { apiHandler } from "@/util/api";
import { NextRequest, NextResponse } from "next/server";
import createHttpError from "http-errors";
import { db } from "@/models";
import { getEmissionResultsBatch } from "@/backend/ResultsService";

export const GET = apiHandler(async (_req: NextRequest, context) => {
  const { id } = context.params;

  const city = await db.models.City.findOne({
    where: {
      cityId: id,
    },
    include: [
      {
        model: db.models.Inventory,
        as: "inventories",
        attributes: ["inventoryId", "year"],
      },
    ],
  });

  if (!city) {
    throw new createHttpError.NotFound("City not found");
  }

  const EmissionResults = await getEmissionResultsBatch(
    city.inventories.map((i) => i.inventoryId),
  );

  return NextResponse.json({ data: EmissionResults });
});
