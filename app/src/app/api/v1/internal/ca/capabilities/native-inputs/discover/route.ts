/**
 * @swagger
 * /api/v1/internal/ca/capabilities/native-inputs/discover:
 *   post:
 *     tags:
 *       - internal
 *     operationId: postInternalCaNativeInputDiscovery
 *     summary: Discover caller-authorized NativeInputCatalog capabilities
 *     description: Internal Climate Advisor capability route. Returns only safe Core-approved catalog selection metadata; source pointers and content remain in CityCatalyst.
 *     responses:
 *       200:
 *         description: Caller-authorized catalog entries returned.
 *       400:
 *         description: Invalid discovery request.
 *       401:
 *         description: Missing or invalid authentication.
 *       403:
 *         description: Request scope is not authorized.
 *       404:
 *         description: Capability is unavailable without disclosing source metadata.
 */

import { NextResponse } from "next/server";
import { z } from "zod";
import createHttpError from "http-errors";

import {
  discoverNativeInputs,
  type NativeInputDiscoveryRequest,
} from "@/backend/NativeInputCatalogCapabilityService";
import { requireRequestUser } from "@/backend/agentic/ghgi/stationary-energy/auth";
import { requireClimateAdvisorIntegrationEnabled } from "@/backend/agentic/ghgi/stationary-energy/auth";
import { requireClimateAdvisorServiceRequest } from "@/backend/agentic/ghgi/stationary-energy/auth";
import { apiHandler } from "@/util/api";

export const NATIVE_INPUT_DISCOVERY_CAPABILITY = "native_input.discover";

const discoveryRequestSchema = z
  .object({
    userId: z.string().uuid().optional(),
    organizationId: z.string().uuid().optional(),
    projectId: z.string().uuid().optional(),
    cityId: z.string().uuid().optional(),
    inventoryId: z.string().uuid().optional(),
    kind: z.string().trim().min(1).max(64).optional(),
    owningModule: z.string().trim().min(1).max(64).optional(),
    capabilityId: z.string().trim().min(1).max(128).optional(),
  })
  .strict();

export const POST = apiHandler(async (req, { session }) => {
  requireClimateAdvisorIntegrationEnabled();
  requireClimateAdvisorServiceRequest(req);

  const body = discoveryRequestSchema.parse(await req.json());
  if (!session?.user?.id) {
    throw new createHttpError.Unauthorized("Authentication required");
  }
  if (body.userId) requireRequestUser(session, body.userId);

  const request: NativeInputDiscoveryRequest = {
    ...(body.userId ? { userId: body.userId } : {}),
    ...(body.organizationId ? { organizationId: body.organizationId } : {}),
    ...(body.projectId ? { projectId: body.projectId } : {}),
    ...(body.cityId ? { cityId: body.cityId } : {}),
    ...(body.inventoryId ? { inventoryId: body.inventoryId } : {}),
    ...(body.kind ? { kind: body.kind } : {}),
    ...(body.owningModule ? { owningModule: body.owningModule } : {}),
    ...(body.capabilityId
      ? {
          capabilityId:
            body.capabilityId as NativeInputDiscoveryRequest["capabilityId"],
        }
      : {}),
  };

  const entries = await discoverNativeInputs(request, session);
  return NextResponse.json({
    action: NATIVE_INPUT_DISCOVERY_CAPABILITY,
    success: true,
    data: { entries },
  });
});
