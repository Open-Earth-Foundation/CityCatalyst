import { NextResponse } from "next/server";

import { apiHandler } from "@/util/api";
import createHttpError from "http-errors";
import UserService from "@/backend/UserService";
import { upsertInventoryRequest } from "@/util/validation";
import { validate } from "uuid";
import { InventoryService } from "@/backend/InventoryService";
import { PermissionService } from "@/backend/permissions/PermissionService";

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

  // Use PermissionService for access check
  await PermissionService.canAccessInventory(session, inventoryId);
  
  const inventory = await InventoryService.getInventoryWithTotalEmissions(
    inventoryId,
    session,
  );
  return NextResponse.json({ data: inventory });
});

export const DELETE = apiHandler(async (_req, { params, session }) => {
  // Use PermissionService for delete permission (ORG_ADMIN only)
  const { resource: inventory } = await PermissionService.canDeleteInventory(
    session,
    params.inventory
  );
  await inventory.destroy();
  return NextResponse.json({ data: inventory, deleted: true });
});

export const PATCH = apiHandler(async (req, context) => {
  const { params, session } = context;
  const body = upsertInventoryRequest.parse(await req.json());
  // Use PermissionService for edit permission
  const { resource: inventory } = await PermissionService.canEditInventory(
    session,
    params.inventory
  );

  if (hasIsPublicProperty(body)) {
    const publishBody: { isPublic: boolean; publishedAt?: Date | null } = {
      ...body,
    };
    if (publishBody.isPublic && !inventory.isPublic) {
      publishBody.publishedAt = new Date();
    } else if (!publishBody.isPublic) {
      publishBody.publishedAt = null;
    }
    await inventory.update(publishBody);
  }
  inventory = await inventory.update(body);
  return NextResponse.json({ data: inventory });
});
