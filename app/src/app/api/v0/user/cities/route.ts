/**
 * @swagger
 * /api/v0/user/cities:
 *   get:
 *     tags:
 *       - User
 *     summary: List the user’s cities with inventory year metadata.
 *     description: Returns the cities the current user belongs to along with inventory IDs, years, and last updated timestamps. Requires a signed‑in session. Response is wrapped in { data: [{ city, years[] }] }.
 *     responses:
 *       200:
 *         description: Cities with inventory years wrapped in data.
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
 *                       city: { type: object, additionalProperties: true }
 *                       years:
 *                         type: array
 *                         items:
 *                           type: object
 *                           properties:
 *                             year: { type: integer }
 *                             inventoryId: { type: string, format: uuid }
 *                             lastUpdate: { type: string, format: date-time }
 *       401:
 *         description: Unauthorized.
 *       404:
 *         description: User not found.
 */
// fetch the cities attached to a user and the year of the inventories attached to the cities

import { apiHandler } from "@/util/api";
import { NextRequest, NextResponse } from "next/server";
import createHttpError from "http-errors";
import { db } from "@/models";

export const GET = apiHandler(async (_req: NextRequest, context) => {
  if (!context.session) {
    throw new createHttpError.Unauthorized("Unauthorized");
  }

  const user = await db.models.User.findOne({
    attributes: [],
    where: {
      userId: context.session.user.id,
    },
    include: [
      {
        model: db.models.City,
        as: "cities",
        include: [
          {
            model: db.models.Inventory,
            as: "inventories",
            attributes: ["year", "inventoryId", "lastUpdated"],
          },
        ],
      },
    ],
  });

  if (!user) {
    throw new createHttpError.NotFound("User not found");
  }

  const data = user.cities.flatMap((city) => {
    return {
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
    };
  });

  return NextResponse.json({ data });
});
