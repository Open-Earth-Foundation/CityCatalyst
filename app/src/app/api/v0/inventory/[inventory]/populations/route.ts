/**
 * @swagger
 * /api/v0/inventory/{inventory}/populations:
 *   get:
 *     tags:
 *       - Inventory Populations
 *     summary: Get population values used by the inventory’s city and year.
 *     description: Returns city/region/country population values aligned to the inventory’s year (nearest within thresholds). Requires a signed‑in user with access to the inventory. Response is wrapped in { data } with population fields.
 *     parameters:
 *       - in: path
 *         name: inventory
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Population data wrapped in data.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     cityId: { type: string, format: uuid }
 *                     population: { type: number }
 *                     year: { type: number }
 *                     countryPopulation: { type: number }
 *                     countryPopulationYear: { type: number }
 *                     regionPopulation: { type: number }
 *                     regionPopulationYear: { type: number }
 *       404:
 *         description: Inventory not found.
 */
import PopulationService from "@/backend/PopulationService";
import UserService from "@/backend/UserService";
import { apiHandler } from "@/util/api";
import createHttpError from "http-errors";
import { NextResponse } from "next/server";

export const GET = apiHandler(async (req, { params, session }) => {
  const { inventory: inventoryId } = params;
  if (!inventoryId) {
    throw new createHttpError.BadRequest("inventoryId is required!");
  }

  const inventory = await UserService.findUserInventory(
    params.inventory,
    session,
  );

  if (!inventory) {
    throw new createHttpError.NotFound("Inventory not found");
  }

  const populations = await PopulationService.getPopulationDataForCityYear(
    inventory.cityId!,
    inventory.year!,
  );
  return NextResponse.json({ data: populations });
});
