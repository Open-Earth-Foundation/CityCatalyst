/**
 * @swagger
 * /api/v1/inventory/{inventory}/draft/stationary-energy:
 *   post:
 *     tags:
 *       - inventory
 *       - drafts
 *     operationId: createStationaryEnergyDraft
 *     summary: Create city-scoped Stationary Energy draft proposals.
 *     description: Loads the inventory city context, current Stationary Energy state, applicable Global API-backed data sources, sends a normalized payload to Climate Advisor, and returns staged draft proposals with provenance.
 */
import AgenticInventoryDraftService from "@/backend/AgenticInventoryDraftService";
import { PermissionService } from "@/backend/permissions/PermissionService";
import { db } from "@/models";
import { City } from "@/models/City";
import { apiHandler } from "@/util/api";
import createHttpError from "http-errors";
import { NextResponse } from "next/server";
import { z } from "zod";

const draftRequestSchema = z.object({
  cityId: z.string().uuid(),
  locale: z.enum(["en", "es", "pt"]).optional(),
  sectorCode: z.literal("I").optional(),
});

export const POST = apiHandler(async (req, { params, session }) => {
  const body = draftRequestSchema.parse(await req.json());
  const { resource } = await PermissionService.canEditInventory(
    session,
    params.inventory,
  );

  const models = db.models as any;
  const inventory = await models.Inventory.findByPk(params.inventory, {
    include: [{ model: City, as: "city" }],
  });
  if (!inventory) {
    throw new createHttpError.NotFound("Inventory not found");
  }

  const permittedInventory = resource as { inventoryId?: string };
  if (inventory.inventoryId !== permittedInventory.inventoryId) {
    throw new createHttpError.Forbidden("Inventory access mismatch");
  }

  if (inventory.cityId !== body.cityId) {
    throw new createHttpError.BadRequest(
      "Route cityId does not match the inventory city",
    );
  }

  const draftRun =
    await AgenticInventoryDraftService.buildStationaryEnergyDraftRun({
      inventory,
      locale: body.locale,
    });

  return NextResponse.json({ data: draftRun });
});
