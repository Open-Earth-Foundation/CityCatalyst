/**
 * @swagger
 * /api/v0/city/{city}/years:
 *   get:
 *     tags:
 *       - City
 *     summary: List inventory identifiers and years for a city.
 *     description: Returns the basic city info plus a list of inventory IDs with years and last update timestamps. Requires a signed‑in user (future: public if inventory is public). Response is wrapped in { data: { city, years[] } }.
 *     parameters:
 *       - in: path
 *         name: city
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: City and years wrapped in data.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     city: { type: object, additionalProperties: true }
 *                     years:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           year: { type: integer }
 *                           inventoryId: { type: string, format: uuid }
 *                           lastUpdate: { type: string, format: date-time }
 *       404:
 *         description: City not found.
 */
// fetch the years of the inventories attached to a city

import { apiHandler } from "@/util/api";
import { NextRequest, NextResponse } from "next/server";
import createHttpError from "http-errors";
import { db } from "@/models";

export const GET = apiHandler(async (_req: NextRequest, { params }) => {
  // TODO implement access control (check if inventory is public)
  /* if (!context.session && !inventory.isPublic) {
    throw new createHttpError.Unauthorized("Unauthorized");
  } */

  const city = await db.models.City.findByPk(params.city, {
    include: [
      {
        model: db.models.Inventory,
        as: "inventories",
        attributes: ["year", "inventoryId", "lastUpdated"],
      },
    ],
  });

  if (!city) {
    throw new createHttpError.NotFound("City not found");
  }

  return NextResponse.json({
    data: {
      city: {
        name: city.name,
        locode: city.locode,
        area: city.area,
        country: city.country,
        countryLocode: city.countryLocode,
        region: city.region,
        regionLocode: city.regionLocode,
        cityId: city.cityId,
      },
      years: city.inventories.map((inventory) => ({
        year: inventory.year,
        inventoryId: inventory.inventoryId,
        lastUpdate: inventory.lastUpdated,
      })),
    },
  });
});
