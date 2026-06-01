import { apiHandler } from "@/util/api";
import { NextResponse } from "next/server";
import { PermissionService } from "@/backend/permissions/PermissionService";
import createHttpError from "http-errors";
import { Inventory } from "@/models/Inventory";
import {
  commitAcceptedStationaryEnergyRows,
  type CommitAcceptedRow,
} from "@/backend/agentic/ghgi/stationary-energy/commit";
import { commitAcceptedStationaryEnergyInputSchema } from "@/backend/agentic/ghgi/stationary-energy/registry";
import {
  requireClimateAdvisorServiceRequest,
  requireRequestUser,
  requireStationaryEnergyAgenticEnabled,
} from "@/backend/agentic/ghgi/stationary-energy/auth";

export const POST = apiHandler(async (req, { session }) => {
  requireStationaryEnergyAgenticEnabled();
  requireClimateAdvisorServiceRequest(req);

  const body = commitAcceptedStationaryEnergyInputSchema.parse(
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

  const results = await commitAcceptedStationaryEnergyRows({
    inventory,
    rows: body.rows as CommitAcceptedRow[],
    userId: body.user_id,
  });

  return NextResponse.json({
    draft_run_id: body.draft_run_id,
    inventory_id: body.inventory_id,
    results,
  });
});
