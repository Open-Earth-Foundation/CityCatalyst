/**
 * @swagger
 * /api/v0/inventory/{inventory}/activity-value:
 *   post:
 *     tags:
 *       - Inventory Activity
 *     summary: Create an activity value (edit access).
 *     description: Creates an activity and associated inventory/gas values as needed. Requires a signed‑in user with edit access to the inventory. Returns a success flag and the created value in { success, data }.
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
 *         description: Success flag and created value.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                       format: uuid
 *                       description: Unique identifier for the created activity value
 *                     activityData:
 *                       type: object
 *                       additionalProperties: true
 *                       description: Activity data specific to this inventory value
 *                     co2eq:
 *                       type: number
 *                       description: CO2 equivalent emissions (in bigint format)
 *                     co2eqYears:
 *                       type: number
 *                       description: Number of years for CO2 equivalent calculation
 *                     inventoryValueId:
 *                       type: string
 *                       format: uuid
 *                       nullable: true
 *                       description: Associated inventory value ID
 *                     datasourceId:
 *                       type: string
 *                       format: uuid
 *                       nullable: true
 *                       description: Associated data source ID
 *                     metadata:
 *                       type: object
 *                       additionalProperties: true
 *                       description: Additional metadata for the activity value
 *                     created:
 *                       type: string
 *                       format: date-time
 *                       description: Creation timestamp
 *                     lastUpdated:
 *                       type: string
 *                       format: date-time
 *                       description: Last update timestamp
 *                   description: Created activity value with all properties
 *       400:
 *         description: Invalid data.
 *     examples:
 *       application/json:
 *         gasValues:
 *           - gas: "CO2"
 *             value: 1000.5
 *         inventoryValueId: "550e8400-e29b-41d4-a716-446655440000"
 *         inventoryValue:
 *           gpcReferenceNumber: "1.1.1"
 *           value: 50000
 *           inputMethodology: "550e8400-e29b-41d4-a716-446655440001"
 *           subCategoryId: "550e8400-e29b-41d4-a716-446655440002"
 * */
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

/**
 * @swagger
 * /api/v0/inventory/{inventory}/activity-value:
 *   get:
 *     tags:
 *       - Inventory Activity
 *     summary: List activity values for an inventory (edit access).
 *     description: Returns activity values filtered by subCategoryIds or subSectorId, optionally by methodology. Requires a signed‑in user with edit access to the inventory. Response is wrapped in { data: ActivityValue[] }.
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
 *         description: Activity values wrapped in data.
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
 *                       id:
 *                         type: string
 *                         format: uuid
 *                         description: Unique identifier for the activity value
 *                       activityData:
 *                         type: object
 *                         additionalProperties: true
 *                         description: Activity data specific to this inventory value
 *                       co2eq:
 *                         type: number
 *                         description: CO2 equivalent emissions (in bigint format)
 *                       co2eqYears:
 *                         type: number
 *                         description: Number of years for CO2 equivalent calculation
 *                       inventoryValueId:
 *                         type: string
 *                         format: uuid
 *                         nullable: true
 *                         description: Associated inventory value ID
 *                       datasourceId:
 *                         type: string
 *                         format: uuid
 *                         nullable: true
 *                         description: Associated data source ID
 *                       metadata:
 *                         type: object
 *                         additionalProperties: true
 *                         description: Additional metadata for the activity value
 *                       created:
 *                         type: string
 *                         format: date-time
 *                         description: Creation timestamp
 *                       lastUpdated:
 *                         type: string
 *                         format: date-time
 *                         description: Last update timestamp
 *                       inventoryValue:
 *                         type: object
 *                         properties:
 *                           inventoryValueId:
 *                             type: string
 *                             format: uuid
 *                           gpcReferenceNumber:
 *                             type: string
 *                           inventoryId:
 *                             type: string
 *                             format: uuid
 *                           value:
 *                             type: number
 *                           inputMethodology:
 *                             type: string
 *                             format: uuid
 *                           subCategoryId:
 *                             type: string
 *                             format: uuid
 *                           created:
 *                             type: string
 *                             format: date-time
 *                           lastUpdated:
 *                             type: string
 *                             format: date-time
 *                         description: Associated inventory value with calculation data
 *                       gasValues:
 *                         type: array
 *                         items:
 *                           type: object
 *                           properties:
 *                             gasValueId:
 *                               type: string
 *                               format: uuid
 *                             gas:
 *                               type: string
 *                             value:
 *                               type: number
 *                             activityValueId:
 *                               type: string
 *                               format: uuid
 *                             emissionsFactor:
 *                               type: object
 *                               properties:
 *                                 id:
 *                                   type: string
 *                                   format: uuid
 *                                 gpcReferenceNumber:
 *                                   type: string
 *                                 emissionsPerActivity:
 *                                   type: number
 *                                 gas:
 *                                   type: string
 *                           description: Gas-specific values and emissions factors
 *                     description: Activity value with associated inventory value and gas values
 *       400:
 *         description: Missing required query parameter.
 * */
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

/**
 * @swagger
 * /api/v0/inventory/{inventory}/activity-value:
 *   delete:
 *     tags:
 *       - Inventory Activity
 *     summary: Delete activities by subsector or reference number (edit access).
 *     description: Deletes activity rows within a subsector or by GPC reference number. Requires a signed‑in user with edit access. Returns a success flag and deletedCount in { success, data }.
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
 *         description: Success flag and deleted count.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     deletedCount:
 *                       type: integer
 *       400:
 *         description: Invalid query combination.
 */
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
