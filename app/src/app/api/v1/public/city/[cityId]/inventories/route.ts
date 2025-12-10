/**
 * @swagger
 * /api/v1/public/city/{cityId}/inventories:
 *   get:
 *     tags:
 *       - Public
 *     operationId: getPublicCityInventories
 *     summary: List public inventories for a city by ID.
 *     description: Public endpoint that returns the city’s public inventories (newest first). No authentication is required. Response is wrapped in '{' data: Inventory[] '}' and includes basic fields like inventoryId, inventoryName, year, publishedAt, lastUpdated, and totalEmissions.
 *     parameters:
 *       - in: path
 *         name: cityId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Public inventories wrapped in data.
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
 *                       inventoryId:
 *                         type: string
 *                         format: uuid
 *                       inventoryName:
 *                         type: string
 *                       year:
 *                         type: integer
 *                       isPublic:
 *                         type: boolean
 *                       publishedAt:
 *                         type: string
 *                         format: date-time
 *                       lastUpdated:
 *                         type: string
 *                         format: date-time
 *                       totalEmissions:
 *                         type: number
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
import { QueryTypes } from "sequelize";

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
    ],
  });

  // Add total emissions for each inventory
  const inventoriesWithTotals = await Promise.all(
    publicInventories.map(async (inventory) => {
      const rawQuery = `
        SELECT SUM(co2eq) as sum
        FROM "InventoryValue"
        WHERE inventory_id = :inventoryId
      `;

      const [{ sum }] = (await db.sequelize!.query(rawQuery, {
        replacements: { inventoryId: inventory.inventoryId },
        type: QueryTypes.SELECT,
        raw: true,
      })) as unknown as { sum: number }[];

      return {
        ...inventory.toJSON(),
        totalEmissions: sum || 0,
      };
    })
  );

  return NextResponse.json({ data: inventoriesWithTotals });
});
