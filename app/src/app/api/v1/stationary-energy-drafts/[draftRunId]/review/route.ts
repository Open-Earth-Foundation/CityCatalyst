import { NextResponse } from "next/server";
import { z } from "zod";

import { callClimateAdvisor } from "@/backend/agentic/ghgi/stationary-energy/ca";
import { requireStationaryEnergyAgenticEnabled } from "@/backend/agentic/ghgi/stationary-energy/auth";
import { apiHandler } from "@/util/api";

const decisionSchema = z.object({
  proposal_id: z.string().uuid(),
  action: z.enum([
    "accept",
    "override_source",
    "override_manual",
    "leave_draft",
  ]),
  selected_source_id: z.string().uuid().optional(),
  manual_value: z.number().optional(),
  manual_unit: z.string().optional(),
  note: z.string().optional(),
});

const requestSchema = z.object({
  inventory_id: z.string().uuid().optional(),
  decisions: z.array(decisionSchema).min(1),
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
    path: `/v1/stationary-energy-drafts/${draftRunId}/review`,
    method: "POST",
    tokenUserID: session.user.id,
    inventoryId: body.inventory_id,
    body: {
      user_id: session.user.id,
      decisions: body.decisions,
    },
  });
  const payload = await response.json();

  return NextResponse.json(payload, { status: response.status });
});
