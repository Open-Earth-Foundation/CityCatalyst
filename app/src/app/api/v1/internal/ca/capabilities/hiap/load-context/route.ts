import createHttpError from "http-errors";
import { NextResponse } from "next/server";

import { buildHiapContext } from "@/backend/agentic/hiap/context";
import {
  requireClimateAdvisorServiceRequest,
  requireHiapAgenticEnabled,
  requireRequestUser,
} from "@/backend/agentic/hiap/auth";
import { loadHiapContextInputSchema } from "@/backend/agentic/hiap/registry";
import { PermissionService } from "@/backend/permissions/PermissionService";
import { Inventory } from "@/models/Inventory";
import { apiHandler } from "@/util/api";

export const POST = apiHandler(async (req, { session }) => {
  requireHiapAgenticEnabled();
  requireClimateAdvisorServiceRequest(req);

  const body = loadHiapContextInputSchema.parse(await req.json());
  requireRequestUser(session, body.user_id);

  const { resource } = await PermissionService.canAccessInventory(
    session,
    body.inventory_id,
  );
  const inventory = resource as Inventory;
  if (!inventory || inventory.cityId !== body.city_id) {
    throw new createHttpError.BadRequest(
      "Inventory does not belong to the requested city",
    );
  }

  const context = await buildHiapContext({
    inventory,
    lng: body.lng,
  });

  return NextResponse.json(context);
});
