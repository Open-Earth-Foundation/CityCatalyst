import { db } from "@/models";
import { apiHandler } from "@/util/api";
import { createSubCategory } from "@/util/validation";
import createHttpError from "http-errors";
import { NextRequest, NextResponse } from "next/server";

export const GET = apiHandler(async (req: NextRequest, { params }) => {
  const subcategory = await db.models.SubCategory.findOne({
    where: { subcategoryId: params.subcategory },
  });

  if (!subcategory) {
    throw new createHttpError.NotFound("Sub category not found");
  }

  return NextResponse.json({ data: subcategory });
});

export const PATCH = apiHandler(async (req: NextRequest, { params }) => {
  const body = createSubCategory.parse(await req.json());
  let subcategory = await db.models.SubSector.findOne({
    where: { subsectorId: params.subcategory },
  });

  if (!subcategory) {
    throw new createHttpError.NotFound("Sub category not found");
  }

  subcategory = await subcategory.update(body);

  return NextResponse.json({ data: subcategory });
});

export const DELETE = apiHandler(async (req: NextRequest, { params }) => {
  const subcategory = await db.models.SubCategory.findOne({
    where: {
      subcategoryId: params.subsector,
    },
  });
  if (!subcategory) {
    throw new createHttpError.NotFound("Sub category not found");
  }

  await subcategory.destroy();

  return NextResponse.json({ data: subcategory, deleted: true });
});
