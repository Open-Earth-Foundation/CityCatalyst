import UserService from "@/backend/UserService";
import { db } from "@/models";
import { apiHandler } from "@/util/api";
import { createActivityValueRequest } from "@/util/validation";
import { NextResponse } from "next/server";
import { z } from "zod";
import ActivityService, {
  UpdateGasValueInput,
} from "@/backend/ActivityService";

export const PATCH = apiHandler(async (req, { params, session }) => {
  const id = z.string().uuid().parse(params.id);
  const body = createActivityValueRequest.parse(await req.json());

  const {
    gasValues,
    inventoryValue: inventoryValueParams,
    inventoryValueId,
    ...data
  } = body;

  // just for access control
  await UserService.findUserInventory(params.inventory, session);

  const result = await ActivityService.updateActivity({
    id,
    activityValueParams: data,
    inventoryValueId,
    inventoryValueParams,
    gasValues: gasValues as UpdateGasValueInput[],
  });

  return NextResponse.json({ success: true, data: result });
});

export const DELETE = apiHandler(async (_req, { params, session }) => {
  const id = z.string().uuid().parse(params.id);

  // just for access control
  await UserService.findUserInventory(params.inventory, session);

  await ActivityService.deleteActivity(id);

  return NextResponse.json({ success: true });
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
      // TODO can this join be removed? This was previously only used for data quality and explanation
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
