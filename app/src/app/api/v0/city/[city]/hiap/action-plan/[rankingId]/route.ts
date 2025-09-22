import { NextRequest, NextResponse } from "next/server";
import { apiHandler } from "@/util/api";
import { z } from "zod";
import createHttpError from "http-errors";
import { languages } from "@/i18n/settings";
import { PermissionService } from "@/backend/permissions/PermissionService";
import { startActionPlanJob } from "@/backend/hiap/HiapApiService";
import { ACTION_TYPES, HIAction, LANGUAGES } from "@/util/types";

const generateRankingRequest = z.object({
  action: z.any(), // HIAction object - using z.any() for flexibility
  inventoryId: z.string().uuid("Inventory ID is required"),
  cityLocode: z.string().min(1, "City is required"),
  lng: z.enum([languages[0], ...languages.slice(1)]).optional(), // workaround for required first element in Zod type
});

export const POST = apiHandler(
  async (req: NextRequest, { params, session }) => {
    const body = generateRankingRequest.parse(await req.json());
    await PermissionService.canAccessInventory(session, body.inventoryId);

    const lng = body.lng || languages[0];
    console.log("Actionx:", body.action);
    console.log("Cityx:", body.cityLocode);
    console.log("Lngx:", lng);

    const result = await startActionPlanJob({
      action: body.action as HIAction,
      cityLocode: body.cityLocode,
      lng: lng as LANGUAGES,
      inventoryId: body.inventoryId,
    });

    return NextResponse.json({ data: result });
  },
);
