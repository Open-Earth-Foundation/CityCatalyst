/**
 * @swagger
 * /api/v0/public/city/{cityId}/inventories:
 *   get:
 *     tags:
 *       - Public
 *     summary: List public inventories for a city
 *     parameters:
 *       - in: path
 *         name: cityId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Public inventories returned.
 *       400:
 *         description: Invalid city ID.
 *       404:
 *         description: City not found.
 */
import { NextResponse } from "next/server";
import { apiHandler } from "@/util/api";
import createHttpError from "http-errors";
import { validate } from "uuid";
import { db } from "@/models";

export const GET = apiHandler(async (req, { params }) => {
  const { cityId } = params;

  if (!validate(cityId)) {
    throw new createHttpError.BadRequest(
      `'${cityId}' is not a valid city id (uuid)`,
    );
  }

  // First verify the city exists
  const city = await db.models.City.findByPk(cityId, {
    attributes: ["cityId"],
  });

  if (!city) {
    throw new createHttpError.NotFound("City not found");
  }

  // Get all public inventories for this city, ordered by year descending
  const publicInventories = await db.models.Inventory.findAll({
    where: {
      cityId: cityId,
      isPublic: true,
    },
    order: [["year", "DESC"]],
    attributes: [
      "inventoryId",
      "inventoryName",
      "year",
      "isPublic",
      "publishedAt",
      "lastUpdated",
      "totalEmissions",
    ],
  });

  return NextResponse.json({ data: publicInventories });
});
