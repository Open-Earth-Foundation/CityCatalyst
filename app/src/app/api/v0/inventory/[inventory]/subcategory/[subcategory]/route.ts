import { db } from "@/models";
import { apiHandler } from "@/util/api";
import { createSubCategory } from "@/util/validation";
import createHttpError from "http-errors";
import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";

export const GET = apiHandler(async (_req: NextRequest, { params }) => {
  const subcategoryValue = await db.models.SubCategoryValue.findOne({
    where: { subcategoryId: params.subcategory, inventoryId: params.inventory },
  });

  if (!subcategoryValue) {
    throw new createHttpError.NotFound("Sub category value not found");
  }

  return NextResponse.json({ data: subcategoryValue });
});

export const PATCH = apiHandler(async (req: NextRequest, { params }) => {
  const body = createSubCategory.parse(await req.json());
  let subCategoryValue = await db.models.SubCategoryValue.findOne({
    where: { subcategoryId: params.subcategory, inventoryId: params.inventory },
    include: [{ model: db.models.DataSource, as: "dataSource" }],
  });
  const sourceData = body.dataSource;
  delete body.dataSource;

  if (subCategoryValue) {
    // update or replace data source if necessary
    let datasourceId: string | undefined = undefined;
    if (sourceData) {
      if (subCategoryValue.datasourceId) {
        if (subCategoryValue.dataSource.sourceType === "user") {
          await subCategoryValue.dataSource.update(sourceData);
          datasourceId = subCategoryValue.datasourceId;
        } else {
          const source = await db.models.DataSource.create({
            datasourceId: randomUUID(),
            ...sourceData,
          });
          datasourceId = source.datasourceId;
        }
      }
    }
    subCategoryValue = await subCategoryValue.update({ datasourceId, ...body });
  } else {
    const source = await db.models.DataSource.create({
      datasourceId: randomUUID(),
      ...sourceData,
    });

    let subSectorValue = await db.models.SubSectorValue.findOne({
      where: { inventoryId: params.inventory },
      include: [
        {
          model: db.models.SubCategoryValue,
          as: "subCategoryValues",
          where: { subcategoryId: params.subcategory },
          required: true,
        },
      ],
    });
    if (!subSectorValue) {
      const subSector = await db.models.SubSector.findOne({
        include: [
          {
            model: db.models.SubCategory,
            as: "subCategories",
            where: { subcategoryId: params.subcategory },
            required: true,
          },
        ],
      });
      if (!subSector) {
        throw new createHttpError.InternalServerError(
          "No subsector found for subcategory " + params.subcategory,
        );
      }
      subSectorValue = await db.models.SubSectorValue.create({
        subsectorValueId: randomUUID(),
        subsectorId: subSector?.subsectorId,
      });
    }

    subCategoryValue = await db.models.SubCategoryValue.create({
      subcategoryValueId: randomUUID(),
      subcategoryId: params.subcategory,
      subsectorValueId: subSectorValue.subsectorValueId,
      inventoryId: params.inventory,
      datasourceId: source.datasourceId,
      ...body,
    });
  }

  return NextResponse.json({ data: subCategoryValue });
});

export const DELETE = apiHandler(async (_req: NextRequest, { params }) => {
  const subcategoryValue = await db.models.SubCategoryValue.findOne({
    where: { subcategoryId: params.subcategory, inventoryId: params.inventory },
  });
  if (!subcategoryValue) {
    throw new createHttpError.NotFound("Sub category value not found");
  }

  await subcategoryValue.destroy();

  return NextResponse.json({ data: subcategoryValue, deleted: true });
});
