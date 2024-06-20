import UserService from "@/backend/UserService";
import { db } from "@/models";
import type { ActivityValue } from "@/models/ActivityValue";
import type { EmissionsFactor } from "@/models/EmissionsFactor";
import { apiHandler } from "@/util/api";
import { createActivityValueRequest } from "@/util/validation";
import { randomUUID } from "crypto";
import createHttpError from "http-errors";
import { NextResponse } from "next/server";
import { Op } from "sequelize";
import { z } from "zod";

export const POST = apiHandler(async (req, { params, session }) => {
  const body = createActivityValueRequest.parse(await req.json());
  // just for access control
  await UserService.findUserInventory(params.inventory, session);

  const result = await db.sequelize?.transaction(
    async (transaction): Promise<ActivityValue> => {
      const gasValues = body.gasValues;
      delete body.gasValues;
      const dataSourceParams = body.dataSource;
      delete body.dataSource;

      const dataSource = await db.models.DataSource.create(
        {
          ...dataSourceParams,
          datasourceId: randomUUID(),
        },
        { transaction },
      );
      const activityValue = await db.models.ActivityValue.create(
        {
          ...body,
          datasourceId: dataSource.datasourceId,
          id: randomUUID(),
        },
        { transaction },
      );

      if (gasValues) {
        for (const gasValue of gasValues) {
          let emissionsFactor: EmissionsFactor | null = null;

          // update emissions factor if already assigned and from this inventory
          if (
            gasValue.emissionsFactorId == null &&
            gasValue.emissionsFactor != null
          ) {
            emissionsFactor = await db.models.EmissionsFactor.create(
              {
                ...gasValue.emissionsFactor,
                id: randomUUID(),
                inventoryId: params.inventory,
              },
              { transaction },
            );
          }

          if (gasValue.emissionsFactor && !emissionsFactor) {
            throw new createHttpError.InternalServerError(
              "Failed to create an emissions factor",
            );
          }

          delete gasValue.emissionsFactor;
          await db.models.GasValue.upsert(
            {
              ...gasValue,
              id: gasValue.id ?? randomUUID(),
              activityValueId: activityValue.id,
              inventoryValueId: activityValue?.inventoryValueId,
            },
            { transaction },
          );
        }
      }

      return activityValue;
    },
  );

  return NextResponse.json({ success: result != null, data: result });
});

export const GET = apiHandler(async (req, { params, session }) => {
  // extract and validate query params
  const subCategoryIdsParam = req.nextUrl.searchParams.get("subCategoryIds");
  if (!subCategoryIdsParam || subCategoryIdsParam.length === 0) {
    throw new createHttpError.BadRequest(
      "Query parameter subCategoryIds is required!",
    );
  }
  const subCategoryIds = subCategoryIdsParam.split(",");

  // optional filter for a specific methodology
  const methodologyId = req.nextUrl.searchParams.get("methodologyId");
  if (methodologyId) {
    z.string().uuid().parse(methodologyId);
  }

  const inventory = await UserService.findUserInventory(
    params.inventory,
    session,
  );

  const activityValues = await db.models.ActivityValue.findAll({
    include: [
      {
        model: db.models.InventoryValue,
        as: "inventoryValue",
        where: {
          subCategoryId: { [Op.in]: subCategoryIds },
          inventoryId: inventory.inventoryId,
          methodologyId: methodologyId ?? undefined,
        },
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
