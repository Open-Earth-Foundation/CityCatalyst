/**
 * @swagger
 * /api/v0/inventory/{inventory}:
 *   get:
 *     summary: Get inventory details by ID
 *     description: Returns inventory details including total emissions for the specified inventory ID. If 'default' is provided, returns the user's default inventory.
 *     tags:
 *       - Inventory
 *     parameters:
 *       - in: path
 *         name: inventory
 *         required: true
 *         schema:
 *           type: string
 *         description: Inventory UUID or 'default'
 *     responses:
 *       200:
 *         description: Inventory details retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   $ref: '#/components/schemas/Inventory'
 *       400:
 *         description: Invalid inventory ID
 *       404:
 *         description: Inventory not found
 *   delete:
 *     summary: Delete an inventory by ID
 *     description: Deletes the specified inventory. Only users with ORG_ADMIN permission can delete inventories.
 *     tags:
 *       - Inventory
 *     parameters:
 *       - in: path
 *         name: inventory
 *         required: true
 *         schema:
 *           type: string
 *         description: Inventory UUID
 *     responses:
 *       200:
 *         description: Inventory deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   $ref: '#/components/schemas/Inventory'
 *                 deleted:
 *                   type: boolean
 *       403:
 *         description: Forbidden - insufficient permissions
 *       404:
 *         description: Inventory not found
 *   patch:
 *     summary: Update inventory details
 *     description: Updates the specified inventory. Only users with edit permission can update inventories.
 *     tags:
 *       - Inventory
 *     parameters:
 *       - in: path
 *         name: inventory
 *         required: true
 *         schema:
 *           type: string
 *         description: Inventory UUID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/UpsertInventoryRequest'
 *     responses:
 *       200:
 *         description: Inventory updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   $ref: '#/components/schemas/Inventory'
 *       400:
 *         description: Invalid request body
 *       403:
 *         description: Forbidden - insufficient permissions
 *       404:
 *         description: Inventory not found
 */
import { NextResponse } from "next/server";

import { apiHandler } from "@/util/api";
import createHttpError from "http-errors";
import UserService from "@/backend/UserService";
import { upsertInventoryRequest } from "@/util/validation";
import { validate } from "uuid";
import { InventoryService } from "@/backend/InventoryService";
import { PermissionService } from "@/backend/permissions/PermissionService";
import { Inventory } from "@/models/Inventory";

function hasIsPublicProperty(
  inventory:
    | {
        inventoryName: string;
        year: number;
        totalEmissions?: number;
        totalCountryEmissions?: number;
      }
    | { isPublic?: boolean },
): inventory is { isPublic: boolean } {
  return (inventory as { isPublic: boolean }).isPublic !== undefined;
}

export const GET = apiHandler(async (req, { session, params }) => {
  let inventoryId = params.inventory;

  if (inventoryId === 'null') {
    throw new createHttpError.BadRequest("'null' is an invalid inventory id");
  }

  if ("default" === inventoryId) {
    // TODO: Add getUserDefaultInventory method to PermissionService
    inventoryId = await UserService.findUserDefaultInventory(session);
    if (!inventoryId) {
      throw new createHttpError.NotFound("user has no default inventory");
    }
  }

  if (!validate(inventoryId)) {
    throw new createHttpError.BadRequest(
      `'${inventoryId}' is not a valid inventory id (uuid)`,
    );
  }

  // Use PermissionService for access check only
  await PermissionService.canAccessInventory(session, inventoryId);

  const inventory = await InventoryService.getInventoryWithTotalEmissions(
    inventoryId,
    session,
  );
  return NextResponse.json({ data: inventory });
});

export const DELETE = apiHandler(async (_req, { params, session }) => {
  // Use PermissionService for delete permission (ORG_ADMIN only)
  const { resource } = await PermissionService.canDeleteInventory(
    session,
    params.inventory
  );


  const inventory = resource as Inventory;

  await inventory.destroy();
  return NextResponse.json({ data: inventory, deleted: true });
});

export const PATCH = apiHandler(async (req, context) => {
  const { params, session } = context;
  const body = upsertInventoryRequest.parse(await req.json());
  // Use PermissionService for edit permission
  const { resource} = await PermissionService.canEditInventory(
    session,
    params.inventory
  );

  const inventory = resource as Inventory;

  let updatedInventory = inventory;

  if (hasIsPublicProperty(body)) {
    const publishBody: { isPublic: boolean; publishedAt?: Date | nl } = {
      ...body,
    };
    if (publishBody.isPublic && !inventory.isPublic) {
      publishBody.publishedAt = new Date();
    } else if (!publishBody.isPublic) {
      publishBody.publishedAt = null;
    }
    await inventory.update(publishBody);
  }
  updatedInventory = await inventory.update(body);
  return NextResponse.json({ data: updatedInventory });
});
