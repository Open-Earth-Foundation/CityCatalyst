import ActivityService from "@/backend/ActivityService";
import UserService from "@/backend/UserService";
import { db } from "@/models";
import type { InventoryValue } from "@/models/InventoryValue";
import { apiHandler } from "@/util/api";
import { createActivityValueRequest } from "@/util/validation";
import createHttpError from "http-errors";
import { NextResponse } from "next/server";
import { Op, type WhereOptions } from "sequelize";
import { z } from "zod";

export const POST = apiHandler(async (req, { params, session }) => {
  const body = createActivityValueRequest.parse(await req.json());
  const {
    gasValues,
    inventoryValue: inventoryValueParams,
    inventoryValueId,
    ...data
  } = body;

  // just for access control
  await UserService.findUserInventory(params.inventory, session);

  const result = await ActivityService.createActivity(
    data,
    params.inventory,
    inventoryValueId,
    inventoryValueParams,
    gasValues,
  );
  return NextResponse.json({ success: !!result, data: result });
});

export const GET = apiHandler(async (req, { params, session }) => {
  // extract and validate query params
  const subCategoryIdsParam = req.nextUrl.searchParams.get("subCategoryIds");
  const subSectorId = req.nextUrl.searchParams.get("subSectorId");

  let subCategoryIds;
  if (subCategoryIdsParam && subCategoryIdsParam.length > 0) {
    subCategoryIds = subCategoryIdsParam.split(",");
  } else if (subSectorId && subSectorId.length > 0) {
    const subCategories = await db.models.SubCategory.findAll({
      where: { subsectorId: subSectorId! },
    });
    subCategoryIds = subCategories.map((sc) => sc.subcategoryId);
  } else {
    throw new createHttpError.BadRequest(
      "Query parameter subCategoryIds or subSectorId is required!",
    );
  }

  // optional filter for a specific methodology
  const methodologyId = req.nextUrl.searchParams.get("methodologyId");
  if (methodologyId) {
    z.string().uuid().parse(methodologyId);
  }

  const inventory = await UserService.findUserInventory(
    params.inventory,
    session,
  );

  const query: WhereOptions<InventoryValue> = {
    inventoryId: inventory.inventoryId,
  };

  if (subCategoryIds && subCategoryIds.length > 0) {
    query.subCategoryId = { [Op.in]: subCategoryIds };
  }
  if (methodologyId) {
    query.inputMethodology = methodologyId;
  }
  const activityValues = await db.models.ActivityValue.findAll({
    include: [
      {
        model: db.models.InventoryValue,
        as: "inventoryValue",
        where: query,
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

export const DELETE = apiHandler(async (req, { params, session }) => {
  const subSectorId = req.nextUrl.searchParams.get("subSectorId");
  const gpcReferenceNumber = req.nextUrl.searchParams.get("gpcReferenceNumber");

  if (!gpcReferenceNumber && !subSectorId) {
    throw new createHttpError.BadRequest(
      "Query parameter gpcReferenceNumber or subSectorId is required!",
    );
  }

  if (subSectorId && gpcReferenceNumber) {
    throw new createHttpError.BadRequest(
      "Query parameter gpcReferenceNumber and subSectorId cannot be used together!",
    );
  }

  const inventory = await UserService.findUserInventory(
    params.inventory,
    session,
  );

  const count = await ActivityService.deleteAllActivitiesInSubsector({
    inventoryId: inventory.inventoryId,
    subsectorId: subSectorId as string,
    referenceNumber: gpcReferenceNumber as string,
  });

  return NextResponse.json({
    success: true,
    data: {
      deletedCount: count,
    },
  });
});
