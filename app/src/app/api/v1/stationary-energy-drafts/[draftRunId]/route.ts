import { apiHandler } from "@/util/api";
import { NextResponse } from "next/server";
import { callClimateAdvisorJson } from "@/backend/agentic/ghgi/stationary-energy/ca";
import { requireStationaryEnergyAgenticEnabled } from "@/backend/agentic/ghgi/stationary-energy/auth";

export const GET = apiHandler(async (req, { session, params }) => {
  requireStationaryEnergyAgenticEnabled();

  if (!session?.user?.id) {
    return NextResponse.json(
      { error: "User authentication required" },
      { status: 401 },
    );
  }

  const searchParams = new URL(req.url).searchParams;
  const inventoryId = searchParams.get("inventory_id") ?? undefined;
  const draftRunId = params.draftRunId;
  const data = await callClimateAdvisorJson({
    origin: req.nextUrl.origin,
    path: `/v1/stationary-energy-drafts/${draftRunId}?user_id=${encodeURIComponent(session.user.id)}`,
    method: "GET",
    userId: session.user.id,
    inventoryId,
  });

  return NextResponse.json(data);
});
