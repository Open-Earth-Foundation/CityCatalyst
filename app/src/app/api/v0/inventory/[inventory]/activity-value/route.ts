/**
 * @swagger
 * /api/v0/inventory/{inventory}/activity-value:
 *   get:
 *     tags:
 *       - Inventory Activity
 *     summary: List activity values for inventory
 *     parameters:
 *       - in: path
 *         name: inventory
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: query
 *         name: subCategoryIds
 *         required: false
 *         description: Comma-separated subcategory IDs
 *         schema:
 *           type: string
 *       - in: query
 *         name: subSectorId
 *         required: false
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: query
 *         name: methodologyId
 *         required: false
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Activity values returned.
 *       400:
 *         description: Missing required query parameter.
 *   post:
 *     tags:
 *       - Inventory Activity
 *     summary: Create an activity value
 *     parameters:
 *       - in: path
 *         name: inventory
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
 *               activityData:
 *                 type: object
 *               metadata:
 *                 type: object
 *               inventoryValueId:
 *                 type: string
 *                 format: uuid
 *               inventoryValue:
 *                 type: object
 *               gasValues:
 *                 type: array
 *                 items:
 *                   type: object
 *     responses:
 *       200:
 *         description: Activity created.
 *       400:
 *         description: Invalid data.
 *   delete:
 *     tags:
 *       - Inventory Activity
 *     summary: Delete activities by subsector or reference number
 *     parameters:
 *       - in: path
 *         name: inventory
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: query
 *         name: subSectorId
 *         required: false
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: query
 *         name: gpcReferenceNumber
 *         required: false
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Activities deleted.
 *       400:
 *         description: Invalid query combination.
 */
import ActivityService from "@/backend/ActivityService";
import { PermissionService } from "@/backend/permissions";
import UserService from "@/backend/UserService";
import { db } from "@/models";
import { Inventory } from "@/models/Inventory";
import type { InventoryValue } from "@/models/InventoryValue";
import { apiHandler } from "@/util/api";
import { createActivityValueRequest } from "@/util/validation";
import createHttpError from "http-errors";
import { NextResponse } from "next/server";
import { Op, type WhereOptions } from "sequelize";
import { z } from "zod";

export const POST = apiHandler(async (req, { params, session }) => {
  const body = createActivityValueRequest.parse(await req.json());
  const {
    gasValues,
    inventoryValue: inventoryValueParams,
    inventoryValueId,
    ...data
  } = body;

  // just for access control
  await PermissionService.canEditInventory(session, params.inventory);

  try {
    const result = await ActivityService.createActivity(
      data,
      params.inventory,
      inventoryValueId,
      inventoryValueParams,
      gasValues,
    );
    return NextResponse.json({ success: !!result, data: result });
  } catch (error: any) {
    // Check for database bigint conversion errors
    if (
      error.message &&
      error.message.includes("is out of range for type bigint")
    ) {
      const customError = new createHttpError.BadRequest(
        "Invalid request",
      ) as createHttpError.HttpError & {
        data?: { type: string; errorKey: string };
      };
      customError.data = {
        type: "CalculationError",
        errorKey: "calculated-emission-values-too-large",
      };
      throw customError;
    }
    // Handle JavaScript BigInt conversion errors
    if (
      error.message &&
      error.message.includes("Cannot convert") &&
      error.message.includes("to a BigInt")
    ) {
      const customError = new createHttpError.BadRequest(
        "Invalid request",
      ) as createHttpError.HttpError & {
        data?: { type: string; errorKey: string };
      };
      customError.data = {
        type: "CalculationError",
        errorKey: "calculated-emission-values-too-large",
      };
      throw customError;
    }

    // Re-throw other errors
    throw error;
  }
});

export const GET = apiHandler(async (req, { params, session }) => {
  // extract and validate query params
  const subCategoryIdsParam = req.nextUrl.searchParams.get("subCategoryIds");
  const subSectorId = req.nextUrl.searchParams.get("subSectorId");

  let subCategoryIds;
  if (subCategoryIdsParam && subCategoryIdsParam.length > 0) {
    subCategoryIds = subCategoryIdsParam.split(",");
  } else if (subSectorId && subSectorId.length > 0) {
    const subCategories = await db.models.SubCategory.findAll({
      where: { subsectorId: subSectorId! },
    });
    subCategoryIds = subCategories.map((sc) => sc.subcategoryId);
  } else {
    throw new createHttpError.BadRequest(
      "Query parameter subCategoryIds or subSectorId is required!",
    );
  }

  // optional filter for a specific methodology
  const methodologyId = req.nextUrl.searchParams.get("methodologyId");
  if (methodologyId) {
    z.string().uuid().parse(methodologyId);
  }

  const { resource } = await PermissionService.canEditInventory(
    session,
    params.inventory,
  );

  const inventory = resource as Inventory;

  const query: WhereOptions<InventoryValue> = {
    inventoryId: inventory.inventoryId,
  };

  if (subCategoryIds && subCategoryIds.length > 0) {
    query.subCategoryId = { [Op.in]: subCategoryIds };
  }
  if (methodologyId) {
    query.inputMethodology = methodologyId;
  }
  const activityValues = await db.models.ActivityValue.findAll({
    include: [
      {
        model: db.models.InventoryValue,
        as: "inventoryValue",
        where: query,
      },
      { model: db.models.DataSource, as: "dataSource" },
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
  });

  if (!activityValues) {
    throw new createHttpError.NotFound("Activity values not found");
  }

  return NextResponse.json({ data: activityValues });
});

export const DELETE = apiHandler(async (req, { params, session }) => {
  const subSectorId = req.nextUrl.searchParams.get("subSectorId");
  const gpcReferenceNumber = req.nextUrl.searchParams.get("gpcReferenceNumber");

  if (!gpcReferenceNumber && !subSectorId) {
    throw new createHttpError.BadRequest(
      "Query parameter gpcReferenceNumber or subSectorId is required!",
    );
  }

  if (subSectorId && gpcReferenceNumber) {
    throw new createHttpError.BadRequest(
      "Query parameter gpcReferenceNumber and subSectorId cannot be used together!",
    );
  }

  const { resource } = await PermissionService.canEditInventory(
    session,
    params.inventory,
  );

  const inventory = resource as Inventory;

  const count = await ActivityService.deleteAllActivitiesInSubsector({
    inventoryId: inventory.inventoryId,
    subsectorId: subSectorId as string,
    referenceNumber: gpcReferenceNumber as string,
  });

  return NextResponse.json({
    success: true,
    data: {
      deletedCount: count,
    },
  });
});
