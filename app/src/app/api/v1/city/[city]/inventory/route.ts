import { db } from "@/models";
import { apiHandler } from "@/util/api";
import { createInventoryRequest } from "@/util/validation";
import createHttpError from "http-errors";
import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { PermissionService } from "@/backend/permissions/PermissionService";
import { City } from "@/models/City";
import { QueryTypes } from "sequelize";

/**
 * @swagger
 * /api/v1/city/{city}/inventory:
 *   post:
 *     tags:
 *       - City Inventory
 *     operationId: postCityCityInventory
 *     summary: Create a new inventory for a city.
 *     description: Creates a new inventory for the specified city. Requires appropriate permissions.
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
 *               year:
 *                 type: number
 *     responses:
 *       200:
 *         description: Created inventory wrapped in data.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     inventoryId:
 *                       type: string
 *                       format: uuid
 *                     year:
 *                       type: number
 *                     cityId:
 *                       type: string
 *                       format: uuid
 *                 didExistAlready:
 *                   type: boolean
 */
export const POST = apiHandler(
  async (req: NextRequest, { session, params }) => {
    const body = createInventoryRequest.parse(await req.json());

    // Check permission to create inventory in this city (ORG_ADMIN or PROJECT_ADMIN required)
    const { resource: city } = await PermissionService.canCreateInventory(
      session,
      params.city,
    );

    if (!city) {
      throw new createHttpError.NotFound("City not found");
    }

    let didExistAlready = true;
    let inventory = await db.models.Inventory.findOne({
      where: {
        cityId: (city as City)?.cityId,
        year: body.year,
      },
    });

    if (!inventory) {
      inventory = await db.models.Inventory.create({
        ...body,
        inventoryId: randomUUID(),
        cityId: (city as City)?.cityId,
      });
      didExistAlready = false;
    }
    return NextResponse.json({ data: inventory, didExistAlready });
  },
);

/**
 * @swagger
 * /api/v1/city/{city}/inventory:
 *   get:
 *     tags:
 *       - City Inventory
 *     operationId: getCityCityInventory
 *     summary: List inventories for a city the user can access.
 *     description: Returns all inventories for the given city after access is validated. Requires a signed‑in user with access to the city. Response is wrapped in data object.
 *     parameters:
 *       - in: path
 *         name: city
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Inventories wrapped in data.
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
 *                       year:
 *                         type: number
 *                       cityId:
 *                         type: string
 *                         format: uuid
 *                       projectId:
 *                         type: string
 *                         format: uuid
 *                         nullable: true
 */
export const GET = apiHandler(
  async (_req: NextRequest, { session, params }) => {
    // Check permission to access city
    const { resource: city } = await PermissionService.canAccessCity(
      session,
      params.city,
    );
    const inventories = await db.models.Inventory.findAll({
      where: { cityId: (city as City)?.cityId },
    });

    // Add total emissions for each inventory
    const inventoriesWithTotals = await Promise.all(
      inventories.map(async (inventory) => {
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
  },
);
