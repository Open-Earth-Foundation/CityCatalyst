import createHttpError from "http-errors";
import { NextResponse } from "next/server";

import {
  commitStationaryEnergyNotationKeys,
  type CommitStationaryEnergyNotationKeyRow,
} from "@/backend/agentic/ghgi/stationary-energy/notation-keys";
import {
  commitStationaryEnergyNotationKeysInputSchema,
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

  const body = commitStationaryEnergyNotationKeysInputSchema.parse(
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

  const results = await commitStationaryEnergyNotationKeys({
    inventory,
    rows: body.rows as CommitStationaryEnergyNotationKeyRow[],
    userId: body.user_id,
  });

  return NextResponse.json({
    draft_run_id: body.draft_run_id,
    inventory_id: body.inventory_id,
    results,
  });
});
