/**
 * @swagger
 * /api/v1/internal/ca/auth/identity:
 *   post:
 *     tags:
 *       - internal
 *     operationId: validateInternalCaIdentity
 *     summary: Resolve the authenticated CityCatalyst user identity
 *     description: Validates Climate Advisor service credentials and a CC-issued user bearer token, then returns the canonical user ID.
 *     parameters:
 *       - in: header
 *         name: Authorization
 *         required: true
 *         schema:
 *           type: string
 *         description: CC-issued user bearer token.
 *       - in: header
 *         name: X-Service-Name
 *         required: true
 *         schema:
 *           type: string
 *           enum: [climate-advisor]
 *       - in: header
 *         name: X-Service-Key
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Canonical authenticated user identity.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               required: [user_id]
 *               properties:
 *                 user_id:
 *                   type: string
 *                   format: uuid
 *       401:
 *         description: User or Climate Advisor service authentication failed.
 */

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
