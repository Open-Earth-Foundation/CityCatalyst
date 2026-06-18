import createHttpError from "http-errors";
import { NextResponse } from "next/server";

import { generateHiapActionPlan } from "@/backend/agentic/hiap/capabilities";
import {
  requireClimateAdvisorServiceRequest,
  requireHiapAgenticEnabled,
  requireRequestUser,
} from "@/backend/agentic/hiap/auth";
import { generateHiapPlanInputSchema } from "@/backend/agentic/hiap/registry";
import { PermissionService } from "@/backend/permissions/PermissionService";
import { Inventory } from "@/models/Inventory";
import { apiHandler } from "@/util/api";

export const POST = apiHandler(async (req, { session }) => {
  requireHiapAgenticEnabled();
  requireClimateAdvisorServiceRequest(req);

  const body = generateHiapPlanInputSchema.parse(await req.json());
  requireRequestUser(session, body.user_id);

  const { resource } = await PermissionService.canEditInventory(
    session,
    body.inventory_id,
  );
  const inventory = resource as Inventory;
  if (!inventory || inventory.cityId !== body.city_id) {
    throw new createHttpError.BadRequest(
      "Inventory does not belong to the requested city",
    );
  }

  const result = await generateHiapActionPlan({
    inventory,
    actionId: body.action_id,
    actionType: body.action_type,
    lng: body.lng,
    createdBy: body.user_id,
  });

  return NextResponse.json(result);
});
