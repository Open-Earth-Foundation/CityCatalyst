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
    user_id: z.string().uuid().optional(),
    organization_id: z.string().uuid().optional(),
    project_id: z.string().uuid().optional(),
    city_id: z.string().uuid().optional(),
    inventory_id: z.string().uuid().optional(),
    kind: z.string().trim().min(1).max(64).optional(),
    owning_module: z.string().trim().min(1).max(64).optional(),
    capability_id: z.string().trim().min(1).max(128).optional(),
  })
  .strict();

export const POST = apiHandler(async (req, { session }) => {
  requireClimateAdvisorIntegrationEnabled();
  requireClimateAdvisorServiceRequest(req);

  const body = discoveryRequestSchema.parse(await req.json());
  if (!session?.user?.id) {
    throw new createHttpError.Unauthorized("Authentication required");
  }
  if (body.user_id) requireRequestUser(session, body.user_id);

  const request: NativeInputDiscoveryRequest = {
    ...(body.user_id ? { userId: body.user_id } : {}),
    ...(body.organization_id ? { organizationId: body.organization_id } : {}),
    ...(body.project_id ? { projectId: body.project_id } : {}),
    ...(body.city_id ? { cityId: body.city_id } : {}),
    ...(body.inventory_id ? { inventoryId: body.inventory_id } : {}),
    ...(body.kind ? { kind: body.kind } : {}),
    ...(body.owning_module ? { owningModule: body.owning_module } : {}),
    ...(body.capability_id
      ? {
          capabilityId:
            body.capability_id as NativeInputDiscoveryRequest["capabilityId"],
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
