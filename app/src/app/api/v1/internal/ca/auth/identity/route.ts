import createHttpError from "http-errors";
import { NextResponse } from "next/server";
import { requireClimateAdvisorServiceRequest } from "@/backend/agentic/ghgi/stationary-energy/auth";
import { apiHandler } from "@/util/api";

/** Validate a CC-issued opaque bearer token for Climate Advisor. */
export const POST = apiHandler(async (req, { session }) => {
  requireClimateAdvisorServiceRequest(req);
  if (!session?.user.id) {
    throw new createHttpError.Unauthorized("Authentication required");
  }
  return NextResponse.json({ user_id: session.user.id });
});
