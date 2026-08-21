import createHttpError from "http-errors";
import { NextResponse } from "next/server";

import { listStationaryEnergyNotationKeyTargets } from "@/backend/agentic/ghgi/stationary-energy/notation-keys";
import {
  listStationaryEnergyNotationKeysInputSchema,
} from "@/backend/agentic/ghgi/stationary-energy/registry";
import {
  requireClimateAdvisorServiceRequest,
  requireRequestUser,
  requireStationaryEnergyAgenticEnabled,
} from "@/backend/agentic/ghgi/stationary-energy/auth";
import { PermissionService } from "@/backend/permissions/PermissionService";
import { Inventory } from "@/models/Inventory";
import { apiHandler } from "@/util/api";

export const POST = apiHandler(async (req, { session }) => {
  requireStationaryEnergyAgenticEnabled();
  requireClimateAdvisorServiceRequest(req);

  const body = listStationaryEnergyNotationKeysInputSchema.parse(
    await req.json(),
  );
  requireRequestUser(session, body.user_id);

  const { resource } = await PermissionService.canEditInventory(
    session,
    body.inventory_id,
  );
  const inventory = resource as Inventory;
  if (!inventory || inventory.cityId !== body.city_id) {
    throw new createHttpError.BadRequest(
      "Inventory does not belong to the requested city",
    );
  }

  return NextResponse.json(await listStationaryEnergyNotationKeyTargets(inventory));
});
