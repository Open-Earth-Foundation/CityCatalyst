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
    catalogId: z.string().uuid(),
    capabilityId: z.string().trim().min(1).max(128),
    userId: z.string().uuid().optional(),
    organizationId: z.string().uuid().optional(),
    projectId: z.string().uuid().optional(),
    cityId: z.string().uuid().optional(),
    inventoryId: z.string().uuid().optional(),
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
  if (body.userId) requireRequestUser(session, body.userId);

  const request: NativeInputSelectedReadRequest = {
    catalogId: body.catalogId,
    capabilityId:
      body.capabilityId as NativeInputSelectedReadRequest["capabilityId"],
    ...(body.userId ? { userId: body.userId } : {}),
    ...(body.organizationId ? { organizationId: body.organizationId } : {}),
    ...(body.projectId ? { projectId: body.projectId } : {}),
    ...(body.cityId ? { cityId: body.cityId } : {}),
    ...(body.inventoryId ? { inventoryId: body.inventoryId } : {}),
    input: body.input,
  };

  return NextResponse.json(await readNativeInputCapability(request, session));
});
