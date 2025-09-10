/**
 * @swagger
 * /api/v0/city/{city}:
 *   get:
 *     tags:
 *       - City
 *     summary: Get city by ID
 *     parameters:
 *       - in: path
 *         name: city
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: City returned.
 *       401:
 *         description: Unauthorized.
 *   delete:
 *     tags:
 *       - City
 *     summary: Delete city by ID
 *     parameters:
 *       - in: path
 *         name: city
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: City deleted.
 *   patch:
 *     tags:
 *       - City
 *     summary: Update city by ID
 *     parameters:
 *       - in: path
 *         name: city
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               locode:
 *                 type: string
 *               name:
 *                 type: string
 *               shape:
 *                 type: object
 *                 nullable: true
 *               area:
 *                 type: integer
 *                 nullable: true
 *               projectId:
 *                 type: string
 *                 format: uuid
 *                 nullable: true
 *     responses:
 *       200:
 *         description: City updated.
 */
import UserService from "@/backend/UserService";
import { apiHandler } from "@/util/api";
import { createCityRequest } from "@/util/validation";
import { NextResponse } from "next/server";
import { Inventory } from "@/models/Inventory";
import { User } from "@/models/User";
import { db } from "@/models";
import { QueryTypes } from "sequelize";
import { logger } from "@/services/logger";
import { DEFAULT_PROJECT_ID } from "@/util/constants";

export const GET = apiHandler(async (_req, { params, session }) => {
  const city = await UserService.findUserCity(params.city, session, true);
  return NextResponse.json({ data: city });
});

export const DELETE = apiHandler(async (_req, { params, session }) => {
  const city = await UserService.findUserCity(params.city, session);
  const userId = session!.user.id;
  const currentDefaultInventory = await User.findOne({
    attributes: [],
    where: {
      userId,
    },
    include: [
      {
        model: Inventory,
        as: "defaultInventory",
        attributes: ["cityId"],
      },
    ],
  });

  const currentDefaultCityId =
    currentDefaultInventory?.defaultInventory?.cityId;
  if (currentDefaultCityId === params.city) {
    const rawQuery = `
        SELECT i.inventory_id, i.city_id
        FROM "CityUser" cu
                 JOIN "City" c ON c.city_id = cu.city_id
                 JOIN "Inventory" i ON i.city_id = c.city_id
        WHERE cu.user_id = :userId
          AND cu.city_id != :cityId
        LIMIT 1;
    `;
    const nextDefaultInventory: { inventory_id: string; city_id: string }[] =
      await db.sequelize!.query(rawQuery, {
        replacements: { userId, cityId: currentDefaultCityId },
        type: QueryTypes.SELECT,
      });

    if (nextDefaultInventory.length > 0) {
      const nextDefault = nextDefaultInventory[0];
      const inventoryId = nextDefault.inventory_id ?? null;
      const cityId = nextDefault.city_id ?? null;
      await User.update(
        { defaultInventoryId: inventoryId, defaultCityId: cityId },
        { where: { userId } },
      );
    } else {
      await User.update(
        { defaultInventoryId: null, defaultCityId: null },
        { where: { userId } },
      );
    }
  }
  await city.destroy();
  return NextResponse.json({ data: city, deleted: true });
});

export const PATCH = apiHandler(async (req, { params, session }) => {
  const body = createCityRequest.parse(await req.json());
  const projectId = body.projectId;
  if (!projectId) {
    logger.info("Project ID is not provided, defaulting to Default Project");
    body.projectId = DEFAULT_PROJECT_ID;
  }
  let city = await UserService.findUserCity(params.city, session);
  city = await city.update(body);
  return NextResponse.json({ data: city });
});
