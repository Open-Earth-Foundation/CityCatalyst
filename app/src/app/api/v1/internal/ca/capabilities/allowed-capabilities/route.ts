import { NextResponse } from "next/server";

import {
  allowedStationaryEnergyCapabilitiesInputSchema,
  getStationaryEnergyAllowedCapabilities,
} from "@/backend/agentic/ghgi/stationary-energy/registry";
import {
  requireClimateAdvisorServiceRequest,
  requireRequestUser,
  requireStationaryEnergyAgenticEnabled,
  requireStationaryEnergyInventoryEditor,
} from "@/backend/agentic/ghgi/stationary-energy/auth";
import { apiHandler } from "@/util/api";

export const POST = apiHandler(async (req, { session }) => {
  requireStationaryEnergyAgenticEnabled();
  requireClimateAdvisorServiceRequest(req);

  const body = allowedStationaryEnergyCapabilitiesInputSchema.parse(
    await req.json(),
  );
  requireRequestUser(session, body.user_id);

  await requireStationaryEnergyInventoryEditor(
    session,
    body.inventory_id,
    body.city_id,
  );

  return NextResponse.json({
    capabilities: getStationaryEnergyAllowedCapabilities(body.workflow_step),
  });
});
