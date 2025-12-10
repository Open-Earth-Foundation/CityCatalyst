/**
 * @swagger
 * /api/v1/inventory/{inventory}/country-emissions:
 *   get:
 *     tags:
 *       - Inventory
 *     operationId: getInventoryInventoryCountryEmissions
 *     summary: Get country emissions data for inventory comparison
 *     description: Returns country-level emissions data for the year closest to the inventory's year. Uses data from OpenClimate API (UNFCCC preferred).
 *     parameters:
 *       - in: path
 *         name: inventory
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Inventory UUID
 *     responses:
 *       200:
 *         description: Country emissions data retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     emissions:
 *                       type: number
 *                       description: Total country emissions in tonnes CO2eq
 *                     yearUsed:
 *                       type: number
 *                       description: Year of the emissions data used
 *                     dataSource:
 *                       type: string
 *                       description: Source of the emissions data (e.g., UNFCCC)
 *                     countryCode:
 *                       type: string
 *                       description: ISO country code
 *                     inventoryYear:
 *                       type: number
 *                       description: Original inventory year requested
 *       404:
 *         description: Inventory not found or no country data available
 *       403:
 *         description: Insufficient permissions to access inventory
 */

import { NextRequest, NextResponse } from "next/server";
import { apiHandler } from "@/util/api";
import createHttpError from "http-errors";
import { validate } from "uuid";
import { PermissionService } from "@/backend/permissions/PermissionService";
import { CountryEmissionsService } from "@/backend/CountryEmissionsService";
import { db } from "@/models";
import { logger } from "@/services/logger";
import { Inventory } from "@/models/Inventory";

export const GET = apiHandler(
  async (_req: NextRequest, { session, params }) => {
    const { inventory: inventoryId } = params;

    if (!validate(inventoryId)) {
      throw new createHttpError.BadRequest(
        `'${inventoryId}' is not a valid inventory id (uuid)`,
      );
    }

    // Check permission to access inventory and get the resource
    const { resource } = await PermissionService.canAccessInventory(
      session,
      inventoryId,
    );

    const inventory = resource as Inventory;

    // Load inventory with city information if not already included
    const inventoryWithCity = inventory
      ? inventory
      : await db.models.Inventory.findByPk(inventoryId, {
          include: [
            {
              model: db.models.City,
              as: "city",
              attributes: ["locode", "name"],
            },
          ],
        });

    if (!inventoryWithCity) {
      throw new createHttpError.NotFound("Inventory not found");
    }

    if (!inventoryWithCity.year) {
      throw new createHttpError.BadRequest(
        "Inventory does not have a year specified",
      );
    }

    if (!inventoryWithCity.city?.locode) {
      throw new createHttpError.BadRequest(
        "City does not have a locode specified",
      );
    }

    // Extract country code from locode
    const countryCode = CountryEmissionsService.getCountryCodeFromLocode(
      inventoryWithCity.city.locode,
    );

    if (!countryCode) {
      throw new createHttpError.BadRequest(
        "Unable to determine country code from city locode",
      );
    }

    // Check if inventory already has country emissions data
    if (
      inventoryWithCity.totalCountryEmissions &&
      inventoryWithCity.totalCountryEmissions > 0
    ) {
      return NextResponse.json({
        data: {
          emissions: Number(inventoryWithCity.totalCountryEmissions),
          yearUsed: inventoryWithCity.year, // Note: stored data might be from a different year
          dataSource: "Cached",
          countryCode,
          inventoryYear: inventoryWithCity.year,
        },
      });
    }

    // Fetch country emissions data from external API
    const countryEmissions = await CountryEmissionsService.getCountryEmissions(
      countryCode,
      inventoryWithCity.year,
    );

    if (!countryEmissions) {
      throw new createHttpError.NotFound(
        `No country emissions data available for ${countryCode} around year ${inventoryWithCity.year}`,
      );
    }

    // Try to store the data for future use, but don't fail if storage fails
    try {
      await inventoryWithCity.update({
        totalCountryEmissions: countryEmissions.emissions,
      });
      logger.info(
        {
          inventoryId: inventoryWithCity.inventoryId,
          countryCode,
          emissions: countryEmissions.emissions,
          yearUsed: countryEmissions.yearUsed,
        },
        "Cached country emissions data for inventory",
      );
    } catch (error) {
      logger.warn(
        {
          error,
          inventoryId: inventoryWithCity.inventoryId,
          countryCode,
        },
        "Failed to cache country emissions data",
      );
      // Continue execution - we can still return the fetched data
    }

    return NextResponse.json({
      data: {
        ...countryEmissions,
        inventoryYear: inventoryWithCity.year,
      },
    });
  },
);
