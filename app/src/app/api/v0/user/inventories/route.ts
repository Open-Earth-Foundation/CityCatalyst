/**
 * @swagger
 * /api/v0/user/inventories:
 *   get:
 *     tags:
 *       - User
 *     summary: List inventories accessible to the current user with city info.
 *     description: Returns inventories for cities the user belongs to, including the city name and locode. Requires a signed‑in session. Response is wrapped in { data: [{ inventory fields…, city: { name, locode } }] }.
 *     responses:
 *       200:
 *         description: Inventories with city info wrapped in data.
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
 *                       inventoryId: { type: string, format: uuid }
 *                       year: { type: integer }
 *                       city:
 *                         type: object
 *                         properties:
 *                           name: { type: string }
 *                           locode: { type: string }
 *       401:
 *         description: Unauthorized.
 *       404:
 *         description: User not found.
 */
import { db } from "@/models";
import type { City } from "@/models/City";
import type { Inventory } from "@/models/Inventory";
import { apiHandler } from "@/util/api";
import createHttpError from "http-errors";
import { NextRequest, NextResponse } from "next/server";

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
          },
        ],
      },
    ],
  });

  if (!user) {
    throw new createHttpError.NotFound("User not found");
  }

  const data = user.cities.flatMap((city: City) => {
    return city.inventories.map((inventory: Inventory) => {
      return {
        ...inventory.dataValues,
        city: { name: city.name, locode: city.locode },
      };
    });
  });

  return NextResponse.json({ data });
});
