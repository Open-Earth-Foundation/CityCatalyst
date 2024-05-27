import UserService from "@/backend/UserService";
import { db } from "@/models";
import { apiHandler } from "@/util/api";
import { createActivityValueRequest } from "@/util/validation";
import createHttpError from "http-errors";
import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { z } from "zod";

export const PATCH = apiHandler(async (req, { params, session }) => {
  const id = z.string().uuid().parse(params.id);
  const body = createActivityValueRequest.parse(await req.json());

  // just for access control
  await UserService.findUserInventory(params.inventory, session);

  const activityValue = await db.models.ActivityValue.findOne({ where: { id } });
  if (!activityValue) {
    throw new createHttpError.NotFound(`Activty value with ID ${id} not found`);
  }

  await db.sequelize?.transaction(async (transaction): Promise<void> => {
    if (body.gasValues) {
      for (const gasValue of body.gasValues) {
        await db.models.GasValue.upsert({
          ...gasValue,
          id: gasValue.id ?? randomUUID(),
          activityValueId: id,
          inventoryValueId: activityValue?.inventoryValueId
        }, { transaction });
      }
      delete body.gasValues;
    }

    await db.models.ActivityValue.update(body, {
      transaction,
      where: { id },
    });
  })

  return NextResponse.json({ "success": true });
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
