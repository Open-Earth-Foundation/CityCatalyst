import UserService from "@/backend/UserService";
import { db } from "@/models";
import { ActivityValue } from "@/models/ActivityValue";
import { apiHandler } from "@/util/api";
import { createActivityValueRequest } from "@/util/validation";
import { randomUUID } from "crypto";
import createHttpError from "http-errors";
import { NextResponse } from "next/server";
import { Op } from "sequelize";

export const POST = apiHandler(async (req, { params, session }) => {
  const body = createActivityValueRequest.parse(await req.json());
  // just for access control
  await UserService.findUserInventory(params.inventory, session);

  const result = await db.sequelize?.transaction(async (transaction): Promise<ActivityValue> => {
    const gasValues = body.gasValues;
    delete body.gasValues;

    const activityValue = await db.models.ActivityValue.create({
      ...body,
      id: randomUUID(),
    }, { transaction });

    if (gasValues) {
      for (const gasValue of gasValues) {
        await db.models.GasValue.upsert({
          ...gasValue,
          id: gasValue.id ?? randomUUID(),
          activityValueId: activityValue.id,
          inventoryValueId: activityValue?.inventoryValueId
        }, { transaction });
      }
    }

    return activityValue;
  })

  return NextResponse.json({ "success": result != null, data: result });
});

export const GET = apiHandler(async (req, { params, session }) => {
  const subCategoryIdsParam = req.nextUrl.searchParams.get("subCategoryIds");
  if (!subCategoryIdsParam || subCategoryIdsParam.length === 0) {
    throw new createHttpError.BadRequest(
      "Query parameter subCategoryIds is required!",
    );
  }
  const subCategoryIds = subCategoryIdsParam.split(",");

  const inventory = await UserService.findUserInventory(params.inventory, session);

  const activityValues = await db.models.ActivityValue.findAll({
    include: [
      {
        model: db.models.InventoryValue,
        as: "inventoryValue",
        where: {
          subCategoryId: { [Op.in]: subCategoryIds },
          inventoryId: inventory.inventoryId,
        }
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

  if (!activityValues) {
    throw new createHttpError.NotFound("Activity values not found");
  }

  return NextResponse.json({ data: activityValues });
});

