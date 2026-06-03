/**
 * @swagger
 * /api/v1/stationary-energy-drafts/resume:
 *   get:
 *     tags:
 *       - stationary-energy-drafts
 *     operationId: resumeStationaryEnergyDraft
 *     summary: Resume the latest active Stationary Energy draft for the current user.
 */

import { callClimateAdvisor } from "@/backend/agentic/ghgi/stationary-energy/ca";
import { requireStationaryEnergyAgenticEnabled } from "@/backend/agentic/ghgi/stationary-energy/auth";
import { apiHandler } from "@/util/api";
import createHttpError from "http-errors";
import { NextResponse } from "next/server";
import { z } from "zod";

const querySchema = z.object({
  city_id: z.string().min(1),
  inventory_id: z.string().min(1),
});

export const GET = apiHandler(async (req, { session, searchParams }) => {
  requireStationaryEnergyAgenticEnabled();

  if (!session?.user?.id) {
    throw new createHttpError.Unauthorized("User authentication required");
  }

  const query = querySchema.parse(searchParams);
  const params = new URLSearchParams({
    user_id: session.user.id,
    city_id: query.city_id,
    inventory_id: query.inventory_id,
    sector_code: "stationary_energy",
  });
  const response = await callClimateAdvisor({
    origin: req.nextUrl.origin,
    path: `/v1/stationary-energy-drafts/resume?${params.toString()}`,
    method: "GET",
    userId: session.user.id,
    inventoryId: query.inventory_id,
  });

  const text = await response.text();
  const payload = text ? JSON.parse(text) : {};
  return NextResponse.json(payload, { status: response.status });
});
