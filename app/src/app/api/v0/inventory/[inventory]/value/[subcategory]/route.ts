import { db } from "@/models";
import { apiHandler } from "@/util/api";
import { createInventoryValue } from "@/util/validation";
import createHttpError from "http-errors";
import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";

export const GET = apiHandler(async (_req: NextRequest, { params }) => {
  const inventoryValue = await db.models.InventoryValue.findOne({
    where: { subCategoryId: params.subcategory, inventoryId: params.inventory },
  });

  if (!inventoryValue) {
    throw new createHttpError.NotFound("Sub category value not found");
  }

  return NextResponse.json({ data: inventoryValue });
});

export const PATCH = apiHandler(async (req: NextRequest, { params }) => {
  const body = createInventoryValue.parse(await req.json());
  let inventoryValue = await db.models.InventoryValue.findOne({
    where: { subCategoryId: params.subcategory, inventoryId: params.inventory },
    include: [{ model: db.models.DataSource, as: "dataSource" }],
  });
  const sourceData = body.dataSource;
  delete body.dataSource;
  const newDataSource = {
    ...sourceData,
    sourceType: "user",
    datasourceId: randomUUID(),
  };

  if (inventoryValue) {
    // update or replace data source if necessary
    let datasourceId: string | undefined = undefined;
    if (inventoryValue.datasourceId) {
      if (inventoryValue.dataSource.sourceType === "user") {
        if (sourceData) {
          await inventoryValue.dataSource.update(sourceData);
        }
        datasourceId = inventoryValue.datasourceId;
      } else {
        const source = await db.models.DataSource.create(newDataSource);
        datasourceId = source.datasourceId;
      }
    } else {
      const source = await db.models.DataSource.create(newDataSource);
      datasourceId = source.datasourceId;
    }

    inventoryValue = await inventoryValue.update({
      ...body,
      subCategoryId: inventoryValue.subCategoryId,
      id: inventoryValue.id,
      inventoryId: params.inventory,
      datasourceId,
    });
  } else {
    const source = await db.models.DataSource.create(newDataSource);

    inventoryValue = await db.models.InventoryValue.create({
      ...body,
      id: randomUUID(),
      subCategoryId: params.subcategory,
      inventoryId: params.inventory,
      datasourceId: source.datasourceId,
    });
  }

  return NextResponse.json({ data: inventoryValue });
});

export const DELETE = apiHandler(async (_req: NextRequest, { params }) => {
  const subcategoryValue = await db.models.InventoryValue.findOne({
    where: { subCategoryId: params.subcategory, inventoryId: params.inventory },
  });
  if (!subcategoryValue) {
    throw new createHttpError.NotFound("Inventory value not found");
  }

  await subcategoryValue.destroy();

  return NextResponse.json({ data: subcategoryValue, deleted: true });
});
