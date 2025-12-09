/**
 * @swagger
 * /api/v1/inventory/{inventory}/activity-value/{id}:
 *   patch:
 *     tags:
 *       - Inventory Activity
 *     operationId: patchInventoryInventoryActivityvalueId
 *     summary: Update an activity value by ID (edit access).
 *     description: Updates the activity value and related gas/emissions factors as needed. Requires a signed‑in user with edit access. Returns a success flag with the updated value.
 *     parameters:
 *       - in: path
 *         name: inventory
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: path
 *         name: id
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
 *     responses:
 *       200:
 *         description: Success flag and updated value.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   description: Whether the update was successful
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                       format: uuid
 *                       description: Unique identifier for the updated activity value
 *                     activityData:
 *                       type: object
 *                       additionalProperties: true
 *                       description: Updated activity data specific to this inventory value
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
 *                       description: Updated metadata for the activity value
 *                     created:
 *                       type: string
 *                       format: date-time
 *                       description: Creation timestamp
 *                     lastUpdated:
 *                       type: string
 *                       format: date-time
 *                       description: Last update timestamp
 *                   description: Updated activity value with all properties
 *       400:
 *         description: Invalid request (e.g., values too large).
 */
import UserService from "@/backend/UserService";
import { db } from "@/models";
import { apiHandler } from "@/util/api";
import { createActivityValueRequest } from "@/util/validation";
import { NextResponse } from "next/server";
import { z } from "zod";
import ActivityService, {
  UpdateGasValueInput,
} from "@/backend/ActivityService";
import { PermissionService } from "@/backend/permissions";
import createHttpError from "http-errors";

export const PATCH = apiHandler(async (req, { params, session }) => {
  const id = z.string().uuid().parse(params.id);
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
    const result = await ActivityService.updateActivity({
      id,
      activityValueParams: data,
      inventoryValueId,
      inventoryValueParams,
      gasValues: gasValues as UpdateGasValueInput[],
    });

    return NextResponse.json({ success: true, data: result });
  } catch (error: any) {
    // Check for database bigint conversion errors
    if (
      error.message &&
      error.message.includes("is out of range for type bigint")
    ) {
      const customError = createHttpError.BadRequest(
        "Invalid request",
      ) as createHttpError.HttpError & {
        data?: { errorKey: string; type: string };
      };
      customError.data = {
        errorKey: "calculated-emission-values-too-large",
        type: "CalculationError",
      };
      throw customError;
    }
    // Check for JavaScript BigInt conversion errors
    if (
      error.message &&
      error.message.includes("Cannot convert") &&
      error.message.includes("to a BigInt")
    ) {
      const customError = createHttpError.BadRequest(
        "Invalid request",
      ) as createHttpError.HttpError & {
        data?: { errorKey: string; type: string };
      };
      customError.data = {
        errorKey: "calculated-emission-values-too-large",
        type: "CalculationError",
      };
      throw customError;
    }
    // Re-throw other errors
    throw error;
  }
});

/**
 * @swagger
 * /api/v1/inventory/{inventory}/activity-value/{id}:
 *   delete:
 *     tags:
 *       - Inventory Activity
 *     operationId: deleteInventoryInventoryActivityvalueId
 *     summary: Delete an activity value by ID (edit access).
 *     description: Removes the activity value row. Requires a signed‑in user with edit access. Returns a success flag.
 *     parameters:
 *       - in: path
 *         name: inventory
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Success flag.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 */
export const DELETE = apiHandler(async (_req, { params, session }) => {
  const id = z.string().uuid().parse(params.id);

  // just for access control
  await PermissionService.canEditInventory(session, params.inventory);

  await ActivityService.deleteActivity(id);

  return NextResponse.json({ success: true });
});
/**
 * @swagger
 * /api/v1/inventory/{inventory}/activity-value/{id}:
 *   get:
 *     tags:
 *       - Inventory Activity
 *     operationId: getInventoryInventoryActivityvalueId
 *     summary: Get a single activity value by ID (edit access).
 *     description: Fetches the activity value with nested inventory/gas values for the inventory. Requires a signed‑in user with edit access to the inventory. Response is wrapped in '{' data '}'.
 *     parameters:
 *       - in: path
 *         name: inventory
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Activity value wrapped in data.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                       format: uuid
 *                       description: Unique identifier for the activity value
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
 *                     inventoryValue:
 *                       type: object
 *                       properties:
 *                         inventoryValueId:
 *                           type: string
 *                           format: uuid
 *                         gpcReferenceNumber:
 *                           type: string
 *                         inventoryId:
 *                           type: string
 *                           format: uuid
 *                         value:
 *                           type: number
 *                         inputMethodology:
 *                           type: string
 *                           format: uuid
 *                         subCategoryId:
 *                           type: string
 *                           format: uuid
 *                         created:
 *                           type: string
 *                           format: date-time
 *                         lastUpdated:
 *                           type: string
 *                           format: date-time
 *                       description: Associated inventory value with calculation data
 *                     gasValues:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           gasValueId:
 *                             type: string
 *                             format: uuid
 *                           gas:
 *                             type: string
 *                           value:
 *                             type: number
 *                           activityValueId:
 *                             type: string
 *                             format: uuid
 *                           emissionsFactor:
 *                             type: object
 *                             properties:
 *                               id:
 *                                 type: string
 *                                 format: uuid
 *                               gpcReferenceNumber:
 *                                 type: string
 *                               emissionsPerActivity:
 *                                 type: number
 *                               gas:
 *                                 type: string
 *                         description: Gas-specific values and emissions factors
 *                   description: Single activity value with associated inventory value and gas values
 * */
export const GET = apiHandler(async (_req, { params, session }) => {
  const id = z.string().uuid().parse(params.id);
  // just for access control
  await PermissionService.canEditInventory(session, params.inventory);

  const data = await db.models.ActivityValue.findOne({
    where: { id },
    include: [
      {
        model: db.models.InventoryValue,
        as: "inventoryValue",
        where: { inventoryId: params.inventory },
        required: true,
      },
      // TODO can this join be removed? This was previously only used for data quality and explanation
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

  return NextResponse.json({ data });
});