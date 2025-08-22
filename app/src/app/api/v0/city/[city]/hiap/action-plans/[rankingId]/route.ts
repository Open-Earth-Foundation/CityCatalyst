import { PermissionService } from "@/backend/permissions/PermissionService";
import { languages } from "@/i18n/settings";
import { apiHandler } from "@/util/api";
import createHttpError from "http-errors";
import { NextRequest, NextResponse } from "next/server";
import z from "zod";

const generateRankingRequest = z.object({
  actionType: z.string().min(1),
  inventoryId: z.string().uuid(),
  lng: z.enum([languages[0], ...languages.slice(1)]).optional(), // workaround for required first element in Zod type
});

export const POST = apiHandler(async (req: NextRequest, { session }) => {
  const body = generateRankingRequest.parse(await req.json());
  await PermissionService.canAccessInventory(session, body.inventoryId);

  const lng = body.lng || languages[0];

  const result = await startActionPlanJob({
    lng,
    actionType: body.actionType,
    inventoryId: body.inventoryId,
  });

  return NextResponse.json({ data: result });
});
