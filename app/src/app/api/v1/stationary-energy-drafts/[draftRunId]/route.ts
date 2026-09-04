import { NextResponse } from "next/server";
import { z } from "zod";

import {
  callClimateAdvisor,
  getClimateAdvisorRequestId,
} from "@/backend/agentic/ghgi/stationary-energy/ca";
import { requireStationaryEnergyAgenticEnabled } from "@/backend/agentic/ghgi/stationary-energy/auth";
import { enrichStationaryEnergyDraftCO2e } from "@/backend/agentic/ghgi/stationary-energy/draft-emissions";
import { db } from "@/models";
import { apiHandler } from "@/util/api";

const querySchema = z.object({
  inventory_id: z.string().uuid().optional(),
});

export const GET = apiHandler(async (req, { session, params }) => {
  requireStationaryEnergyAgenticEnabled();

  if (!session?.user?.id) {
    return NextResponse.json(
      { error: "User authentication required" },
      { status: 401 },
    );
  }

  const searchParams = new URL(req.url).searchParams;
  const query = querySchema.parse(Object.fromEntries(searchParams.entries()));
  const draftRunId = params.draftRunId;
  const response = await callClimateAdvisor({
    path: `/v1/stationary-energy-drafts/${draftRunId}?user_id=${encodeURIComponent(session.user.id)}`,
    method: "GET",
    tokenUserID: session.user.id,
    inventoryId: query.inventory_id,
    requestId: getClimateAdvisorRequestId(req),
  });

  let gwpVersion: string | null = null;
  if (query.inventory_id) {
    const inventory = await db.models.Inventory.findByPk(query.inventory_id, {
      attributes: ["globalWarmingPotentialType"],
    });
    gwpVersion = inventory?.globalWarmingPotentialType ?? null;
  }

  const payload = await enrichStationaryEnergyDraftCO2e(
    await response.json(),
    gwpVersion,
  );

  return NextResponse.json(payload, { status: response.status });
});
