import { NextResponse } from "next/server";
import { z } from "zod";

import { callClimateAdvisor } from "@/backend/agentic/ghgi/stationary-energy/ca";
import { requireStationaryEnergyAgenticEnabled } from "@/backend/agentic/ghgi/stationary-energy/auth";
import { apiHandler } from "@/util/api";

const requestSchema = z.object({
  inventory_id: z.string().uuid().optional(),
});

export const POST = apiHandler(async (req, { session, params }) => {
  requireStationaryEnergyAgenticEnabled();

  if (!session?.user?.id) {
    return NextResponse.json(
      { error: "User authentication required" },
      { status: 401 },
    );
  }

  const body = requestSchema.parse(await req.json());
  const draftRunId = params.draftRunId;
  const response = await callClimateAdvisor({
    origin: req.nextUrl.origin,
    path: `/v1/stationary-energy-drafts/${draftRunId}/save`,
    method: "POST",
    tokenUserID: session.user.id,
    inventoryId: body.inventory_id,
    body: {
      user_id: session.user.id,
    },
  });
  const payload = await response.json();

  return NextResponse.json(payload, { status: response.status });
});
