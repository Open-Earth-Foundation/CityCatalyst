import UserService from "@/backend/UserService";
import { db } from "@/models";
import { apiHandler } from "@/util/api";
import { createActivityValueRequest } from "@/util/validation";
import { NextResponse } from "next/server";
import { z } from "zod";

export const PATCH = apiHandler(async (req, { params, session }) => {
  const id = z.string().uuid().parse(params.id);
  const body = await createActivityValueRequest.parse(await req.json());
  // just for access control
  await UserService.findUserInventory(params.inventory, session);

  const result = await db.models.ActivityValue.update(body, {
    where: { id },
  })
  return NextResponse.json({ "success": true, data: result });
});

export const DELETE = apiHandler(async (_req, { params, session }) => {
  const id = z.string().uuid().parse(params.id);
  // just for access control
  await UserService.findUserInventory(params.inventory, session);

  const result = await db.models.ActivityValue.destroy({
    where: { id },
  });
  return NextResponse.json({ "success": true, data: result });
});

export const GET = apiHandler(async (_req, { params, session }) => {
  const id = z.string().uuid().parse(params.id);
  // just for access control
  await UserService.findUserInventory(params.inventory, session);

  const data = await db.models.ActivityValue.findOne({
    where: { id },
  });
  return NextResponse.json({ data });
});
