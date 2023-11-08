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
  let subcategoryValue = await db.models.SubCategoryValue.findOne({
    where: { subcategoryId: params.subcategory, inventoryId: params.inventory },
  });

  if (subcategoryValue) {
    subcategoryValue = await subcategoryValue.update(body);
  } else {
    subcategoryValue = await db.models.SubCategoryValue.create({
      subcategoryValueId: randomUUID(),
      inventoryId: params.inventory,
      ...body,
    });
  }

  return NextResponse.json({ data: subcategoryValue });
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
