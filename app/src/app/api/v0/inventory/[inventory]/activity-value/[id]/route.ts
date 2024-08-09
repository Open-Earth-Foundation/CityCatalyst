import UserService from "@/backend/UserService";
import { db } from "@/models";
import { EmissionsFactor } from "@/models/EmissionsFactor";
import { apiHandler } from "@/util/api";
import {
  createActivityValueRequest,
  updateActivityValueRequest,
} from "@/util/validation";
import createHttpError from "http-errors";
import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { undefined, z } from "zod";
import ActivityService from "@/backend/ActivityService";

export const PATCH = apiHandler(async (req, { params, session }) => {
  const id = z.string().uuid().parse(params.id);
  const body = createActivityValueRequest.parse(await req.json());

  const {
    gasValues,
    dataSource: dataSourceParams,
    inventoryValue: inventoryValueParams,
    inventoryValueId,
    ...data
  } = body;

  // just for access control
  await UserService.findUserInventory(params.inventory, session);

  const result = await ActivityService.updateActivity({
    id,
    activityValueParams: {
      activityData: data.activityData,
      metadata: data.metadata,
    },
    inventoryValueId,
    inventoryValueParams,
    gasValues,
    dataSourceParams,
  });

  return NextResponse.json({ success: true, data: result });
});

export const DELETE = apiHandler(async (_req, { params, session }) => {
  const id = z.string().uuid().parse(params.id);
  // just for access control
  await UserService.findUserInventory(params.inventory, session);

  const result = await db.models.ActivityValue.destroy({
    where: { id },
  });
  return NextResponse.json({ success: true, data: result });
});

export const GET = apiHandler(async (_req, { params, session }) => {
  const id = z.string().uuid().parse(params.id);
  // just for access control
  await UserService.findUserInventory(params.inventory, session);

  const data = await db.models.ActivityValue.findOne({
    where: { id },
    include: [
      {
        model: db.models.InventoryValue,
        as: "inventoryValue",
        where: { inventoryId: params.inventory },
        required: true,
      },
      { model: db.models.DataSource, as: "dataSource" },
      {
        model: db.models.GasValue,
        as: "gasValues",
        include: [
          {
            model: db.models.EmissionsFactor,
            as: "emissionsFactor",
            include: [{ model: db.models.DataSource, as: "dataSources" }],
          },
        ],
      },
    ],
  });

  return NextResponse.json({ data });
});
