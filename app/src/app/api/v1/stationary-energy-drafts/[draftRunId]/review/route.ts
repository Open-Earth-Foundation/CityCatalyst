import { apiHandler } from "@/util/api";
import { NextResponse } from "next/server";
import { z } from "zod";
import { callClimateAdvisorJson } from "@/backend/agentic/ghgi/stationary-energy/ca";
import { requireStationaryEnergyAgenticEnabled } from "@/backend/agentic/ghgi/stationary-energy/auth";

const decisionSchema = z.object({
  proposal_id: z.string().uuid(),
  action: z.enum([
    "accept",
    "override_source",
    "override_manual",
    "leave_draft",
  ]),
  selected_source_id: z.string().optional(),
  manual_value: z.number().optional(),
  manual_unit: z.string().optional(),
  note: z.string().optional(),
});

const requestSchema = z.object({
  inventory_id: z.string().min(1).optional(),
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
  const data = await callClimateAdvisorJson({
    origin: req.nextUrl.origin,
    path: `/v1/stationary-energy-drafts/${draftRunId}/review`,
    method: "POST",
    userId: session.user.id,
    inventoryId: body.inventory_id,
    body: {
      user_id: session.user.id,
      decisions: body.decisions,
    },
  });

  return NextResponse.json(data);
});
