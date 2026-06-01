import { apiHandler } from "@/util/api";
import { NextResponse } from "next/server";
import { PermissionService } from "@/backend/permissions/PermissionService";
import createHttpError from "http-errors";
import {
  allowedStationaryEnergyCapabilitiesInputSchema,
  getStationaryEnergyAllowedCapabilities,
} from "@/backend/agentic/ghgi/stationary-energy/registry";
import {
  requireClimateAdvisorServiceRequest,
  requireRequestUser,
  requireStationaryEnergyAgenticEnabled,
} from "@/backend/agentic/ghgi/stationary-energy/auth";

export const POST = apiHandler(async (req, { session }) => {
  requireStationaryEnergyAgenticEnabled();
  requireClimateAdvisorServiceRequest(req);

  const body = allowedStationaryEnergyCapabilitiesInputSchema.parse(
    await req.json(),
  );
  requireRequestUser(session, body.user_id);

  const { resource } = await PermissionService.canEditInventory(
    session,
    body.inventory_id,
  );
  const inventory = resource as { cityId?: string | null };
  if (!inventory || inventory.cityId !== body.city_id) {
    throw new createHttpError.BadRequest(
      "Inventory does not belong to the requested city",
    );
  }

  return NextResponse.json({
    capabilities: getStationaryEnergyAllowedCapabilities(body.workflow_step),
  });
});
