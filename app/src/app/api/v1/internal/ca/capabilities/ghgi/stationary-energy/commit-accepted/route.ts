import { NextResponse } from "next/server";

import {
  commitAcceptedStationaryEnergyRows,
  type CommitAcceptedRow,
} from "@/backend/agentic/ghgi/stationary-energy/commit";
import {
  commitAcceptedStationaryEnergyInputSchema,
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

  const body = commitAcceptedStationaryEnergyInputSchema.parse(
    await req.json(),
  );
  requireRequestUser(session, body.user_id);

  const inventory = await requireStationaryEnergyInventoryEditor(
    session,
    body.inventory_id,
    body.city_id,
  );

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
