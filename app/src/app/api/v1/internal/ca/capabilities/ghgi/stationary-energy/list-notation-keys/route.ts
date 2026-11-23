import { NextResponse } from "next/server";

import { listStationaryEnergyNotationKeyTargets } from "@/backend/agentic/ghgi/stationary-energy/notation-keys";
import {
  listStationaryEnergyNotationKeysInputSchema,
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

  const body = listStationaryEnergyNotationKeysInputSchema.parse(
    await req.json(),
  );
  requireRequestUser(session, body.user_id);

  const inventory = await requireStationaryEnergyInventoryEditor(
    session,
    body.inventory_id,
    body.city_id,
  );

  return NextResponse.json(await listStationaryEnergyNotationKeyTargets(inventory));
});
