/**
 * @swagger
 * /api/v1/city/{city}/ghgi:
 *   get:
 *     tags:
 *       - ghg
 *       - inventory
 *     operationId: getCityGhgi
 *     summary: Get GHG inventory data for a city
 *     description: Retrieves greenhouse gas inventory data for a specified city. The city parameter can be a UUID or "default" to use the user's default city.
 *     parameters:
 *       - in: path
 *         name: city
 *         required: true
 *         schema:
 *           type: string
 *         description: City ID (UUID) or "default" to use user's default city
 *     responses:
 *       200:
 *         description: GHG inventory data with total emissions
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   description: Inventory data with calculated total emissions
 *       400:
 *         description: Invalid city ID or 'null' city parameter
 *       404:
 *         description: User has no default city or inventory not found
 */
import { NextResponse } from "next/server";

import { apiHandler } from "@/util/api";
import { db } from "@/models";
import createHttpError from "http-errors";
import UserService from "@/backend/UserService";
import { upsertInventoryRequest } from "@/util/validation";
import { QueryTypes } from "sequelize";
import { validate } from "uuid";
import { InventoryService } from "@/backend/InventoryService";

export const GET = apiHandler(async (req, { session, params }) => {
  let cityId = await params.city;

  if (cityId === "null") {
    throw new createHttpError.BadRequest("'null' is an invalid city id");
  }

  if ("default" === cityId) {
    cityId = await UserService.findUserDefaultCity(session);
    if (!cityId) {
      throw new createHttpError.NotFound("user has no default city");
    }
  }

  if (!validate(cityId)) {
    throw new createHttpError.BadRequest(
      `'${cityId}' is not a valid city id (uuid)`,
    );
  }

  const inventoryId = await InventoryService.getInventoryIdByCityId(cityId);

  const inventory = await InventoryService.getInventoryWithTotalEmissions(
    inventoryId,
    session,
  );
  return NextResponse.json({ data: inventory });
});
