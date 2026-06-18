import createHttpError from "http-errors";
import { NextResponse } from "next/server";

import { rerankHiapAction } from "@/backend/agentic/hiap/capabilities";
import {
  requireClimateAdvisorServiceRequest,
  requireHiapAgenticEnabled,
  requireRequestUser,
} from "@/backend/agentic/hiap/auth";
import { rerankHiapActionInputSchema } from "@/backend/agentic/hiap/registry";
import { PermissionService } from "@/backend/permissions/PermissionService";
import { Inventory } from "@/models/Inventory";
import { apiHandler } from "@/util/api";

export const POST = apiHandler(async (req, { session }) => {
  requireHiapAgenticEnabled();
  requireClimateAdvisorServiceRequest(req);

  const body = rerankHiapActionInputSchema.parse(await req.json());
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

  const result = await rerankHiapAction({
    inventory,
    actionId: body.action_id,
    actionType: body.action_type,
    targetRank: body.target_rank,
    lng: body.lng,
  });

  return NextResponse.json(result);
});
