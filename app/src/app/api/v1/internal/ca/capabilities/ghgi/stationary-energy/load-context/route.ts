import { NextResponse } from "next/server";

import { buildStationaryEnergyContext } from "@/backend/agentic/ghgi/stationary-energy/context";
import {
  loadStationaryEnergyContextInputSchema,
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

  const body = loadStationaryEnergyContextInputSchema.parse(await req.json());
  requireRequestUser(session, body.user_id);

  const inventory = await requireStationaryEnergyInventoryEditor(
    session,
    body.inventory_id,
    body.city_id,
  );

  const context = await buildStationaryEnergyContext({
    inventory,
    locale: body.locale,
  });

  return NextResponse.json(context);
});
