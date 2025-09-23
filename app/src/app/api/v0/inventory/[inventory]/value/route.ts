/**
 * @swagger
 * /api/v0/inventory/{inventory}/value:
 *   get:
 *     tags:
 *       - Inventory Values
 *     summary: List inventory values by subcategories
 *     parameters:
 *       - in: path
 *         name: inventory
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: query
 *         name: subCategoryIds
 *         required: true
 *         description: Comma-separated subcategory IDs
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Inventory values returned.
 *       400:
 *         description: Missing subCategoryIds.
 */
import { PermissionService } from "@/backend/permissions/PermissionService";
import { db } from "@/models";
import { Inventory } from "@/models/Inventory";
import { apiHandler } from "@/util/api";
import createHttpError from "http-errors";
import { NextResponse } from "next/server";
import { Op } from "sequelize";

export const GET = apiHandler(async (req, { params, session }) => {
  const subCategoryIdsParam = req.nextUrl.searchParams.get("subCategoryIds");
  if (!subCategoryIdsParam || subCategoryIdsParam.length === 0) {
    throw new createHttpError.BadRequest(
      "Query parameter subCategoryIds is required!",
    );
  }
  const subCategoryIds = subCategoryIdsParam.split(",");

  const { resource } = await PermissionService.canEditInventory(
    session,
    params.inventory
  );

  const inventory = resource as Inventory;

  const inventoryValues = await db.models.InventoryValue.findAll({
    where: {
      subCategoryId: { [Op.in]: subCategoryIds },
      inventoryId: inventory.inventoryId,
    },
    include: [
      { model: db.models.DataSource, as: "dataSource" },
      {
        model: db.models.ActivityValue,
        as: "activityValues",
        include: [
          {
            model: db.models.GasValue,
            as: "gasValues",
            include: [
              {
                model: db.models.EmissionsFactor,
                as: "emissionsFactor",
                include: [{ model: db.models.DataSource, as: "dataSources" }],
              },
            ],
          },
        ],
      },
    ],
  });

  if (!inventoryValues) {
    throw new createHttpError.NotFound("Inventory values not found");
  }

  return NextResponse.json({ data: inventoryValues });
});
