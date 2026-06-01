import { apiHandler } from "@/util/api";
import { NextResponse } from "next/server";
import { z } from "zod";
import { callClimateAdvisorJson } from "@/backend/agentic/ghgi/stationary-energy/ca";
import { requireStationaryEnergyAgenticEnabled } from "@/backend/agentic/ghgi/stationary-energy/auth";

const requestSchema = z.object({
  city_id: z.string().min(1),
  inventory_id: z.string().min(1),
  thread_id: z.string().uuid().optional(),
  locale: z.string().min(1).optional(),
});

export const POST = apiHandler(async (req, { session }) => {
  requireStationaryEnergyAgenticEnabled();

  if (!session?.user?.id) {
    return NextResponse.json(
      { error: "User authentication required" },
      { status: 401 },
    );
  }

  const body = requestSchema.parse(await req.json());
  const data = await callClimateAdvisorJson({
    origin: req.nextUrl.origin,
    path: "/v1/stationary-energy-drafts/start",
    method: "POST",
    userId: session.user.id,
    inventoryId: body.inventory_id,
    body: {
      user_id: session.user.id,
      city_id: body.city_id,
      inventory_id: body.inventory_id,
      thread_id: body.thread_id,
      locale: body.locale,
    },
  });

  return NextResponse.json(data, { status: 201 });
});
