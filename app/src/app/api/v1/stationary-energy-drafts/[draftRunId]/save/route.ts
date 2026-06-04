import { NextResponse } from "next/server";
import { z } from "zod";

import { callClimateAdvisorJson } from "@/backend/agentic/ghgi/stationary-energy/ca";
import { requireStationaryEnergyAgenticEnabled } from "@/backend/agentic/ghgi/stationary-energy/auth";
import { apiHandler } from "@/util/api";

const requestSchema = z.object({
  inventory_id: z.string().min(1).optional(),
});

export const POST = apiHandler(async (req, { session, params }) => {
  requireStationaryEnergyAgenticEnabled();

  if (!session?.user?.id) {
    return NextResponse.json(
      { error: "User authentication required" },
      { status: 401 },
    );
  }

  const body = requestSchema.parse(await req.json().catch(() => ({})));
  const draftRunId = params.draftRunId;
  const data = await callClimateAdvisorJson({
    origin: req.nextUrl.origin,
    path: `/v1/stationary-energy-drafts/${draftRunId}/save`,
    method: "POST",
    userId: session.user.id,
    inventoryId: body.inventory_id,
    body: {
      user_id: session.user.id,
    },
  });

  return NextResponse.json(data);
});
