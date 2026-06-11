import { NextResponse } from "next/server";
import { z } from "zod";

import { callClimateAdvisor } from "@/backend/agentic/ghgi/stationary-energy/ca";
import { requireStationaryEnergyAgenticEnabled } from "@/backend/agentic/ghgi/stationary-energy/auth";
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
  });
  const payload = await response.json();

  return NextResponse.json(payload, { status: response.status });
});
