import { db } from "@/models";
import { apiHandler } from "@/util/api";
import createHttpError from "http-errors";
import { NextResponse } from "next/server";
import { PermissionService } from "@/backend/permissions/PermissionService";

import { City } from "@/models/City";
import DataSourceService from "@/backend/DataSourceService";

/** disconnects a datasource from an inventory */
export const DELETE = apiHandler(async (_req, { params, session }) => {
  await PermissionService.canEditInventory(session, params.inventoryId, { excludeResource: true });

  const inventoryValues = await db.models.InventoryValue.findAll({
    where: {
      datasourceId: params.datasourceId,
      inventoryId: params.inventoryId,
    },
  });
  if (inventoryValues.length === 0) {
    throw new createHttpError.NotFound("Inventory value not found");
  }

  await db.models.InventoryValue.destroy({
    where: {
      datasourceId: params.datasourceId,
      inventoryId: params.inventoryId,
    },
  });

  return NextResponse.json({ data: inventoryValues, deleted: true });
});

/** gets a datasource from an inventory and scales it if necessary */
export const GET = apiHandler(async (_req, { params, session }) => {
  await PermissionService.canEditInventory(session, params.inventoryId, { excludeResource: true });

  const inventory = await db.models.Inventory.findOne({
    where: { inventoryId: params.inventoryId },
    include: [{ model: City, as: "city" }],
  });
  if (!inventory) {
    throw new createHttpError.NotFound("Inventory not found");
  }

  const source = await DataSourceService.findSource(
    params.inventoryId,
    params.datasourceId,
  );
  if (!source) {
    throw new createHttpError.NotFound("Data source not found");
  }

  const {
    countryPopulationScaleFactor,
    regionPopulationScaleFactor,
    populationIssue,
  } = await DataSourceService.findPopulationScaleFactors(inventory, [source]);
  const sourceData = await DataSourceService.getSourceWithData(
    source,
    inventory,
    countryPopulationScaleFactor,
    regionPopulationScaleFactor,
    populationIssue,
  );
  return NextResponse.json(sourceData);
});
