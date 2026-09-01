/**
 * @swagger
 * /api/v1/internal/ca/capabilities/native-inputs/read:
 *   post:
 *     tags:
 *       - internal
 *     operationId: postInternalCaNativeInputRead
 *     summary: Execute one caller-authorized bounded NativeInputCatalog capability
 *     description: Internal Climate Advisor capability route. Core revalidates the selected catalog entry, capability mapping, scope, readiness, and bounded result before executing one source-owned capability.
 *     responses:
 *       200:
 *         description: Bounded result from the selected capability.
 *       400:
 *         description: Invalid selected-read request.
 *       401:
 *         description: Missing or invalid authentication.
 *       403:
 *         description: Request scope is not authorized.
 *       404:
 *         description: Selected capability is unavailable without disclosing source metadata.
 */

import createHttpError from "http-errors";
import { NextResponse } from "next/server";
import { z } from "zod";

import {
  readNativeInputCapability,
  type NativeInputSelectedReadRequest,
} from "@/backend/NativeInputCatalogCapabilityService";
import { requireClimateAdvisorIntegrationEnabled } from "@/backend/agentic/ghgi/stationary-energy/auth";
import { requireClimateAdvisorServiceRequest } from "@/backend/agentic/ghgi/stationary-energy/auth";
import { requireRequestUser } from "@/backend/agentic/ghgi/stationary-energy/auth";
import { apiHandler } from "@/util/api";

export const NATIVE_INPUT_READ_CAPABILITY = "native_input.read";

const selectedReadRequestSchema = z
  .object({
    catalog_id: z.string().uuid(),
    capability_id: z.string().trim().min(1).max(128),
    user_id: z.string().uuid().optional(),
    organization_id: z.string().uuid().optional(),
    project_id: z.string().uuid().optional(),
    city_id: z.string().uuid().optional(),
    inventory_id: z.string().uuid().optional(),
    input: z.record(z.string(), z.unknown()),
  })
  .strict();

export const POST = apiHandler(async (req, { session }) => {
  requireClimateAdvisorIntegrationEnabled();
  requireClimateAdvisorServiceRequest(req);

  const body = selectedReadRequestSchema.parse(await req.json());
  if (!session?.user?.id) {
    throw new createHttpError.Unauthorized("Authentication required");
  }
  if (body.user_id) requireRequestUser(session, body.user_id);

  const request: NativeInputSelectedReadRequest = {
    catalogId: body.catalog_id,
    capabilityId:
      body.capability_id as NativeInputSelectedReadRequest["capabilityId"],
    ...(body.user_id ? { userId: body.user_id } : {}),
    ...(body.organization_id ? { organizationId: body.organization_id } : {}),
    ...(body.project_id ? { projectId: body.project_id } : {}),
    ...(body.city_id ? { cityId: body.city_id } : {}),
    ...(body.inventory_id ? { inventoryId: body.inventory_id } : {}),
    input: body.input,
  };

  return NextResponse.json(await readNativeInputCapability(request, session));
});
