import { db } from "@/models";
import { apiHandler } from "@/util/api";
import { createSubCategoryValue } from "@/util/validation";
import createHttpError from "http-errors";
import { NextRequest, NextResponse } from "next/server";

export const GET = apiHandler(async (req: NextRequest, { params }) => {
  const subcategoryValue = await db.models.SubCategoryValue.findOne({
    where: { subcategoryValueId: params.subcategoryValue },
  });

  if (!subcategoryValue) {
    throw new createHttpError.NotFound("Sub category value not found");
  }

  return NextResponse.json({ data: subcategoryValue });
});

export const PATCH = apiHandler(async (req: NextRequest, { params }) => {
  const body = createSubCategoryValue.parse(await req.json());
  let subcategoryValue = await db.models.SubCategoryValue.findOne({
    where: { subcategoryValueId: params.subcategoryValue },
  });

  if (!subcategoryValue) {
    throw new createHttpError.NotFound("Sub category value not found");
  }

  subcategoryValue = await subcategoryValue.update(body);

  return NextResponse.json({ data: subcategoryValue });
});

export const DELETE = apiHandler(async (req: NextRequest, { params }) => {
  const subcategoryValue = await db.models.SubCategoryValue.findOne({
    where: {
      subcategoryValueId: params.subcategoryValue,
    },
  });
  if (!subcategoryValue) {
    throw new createHttpError.NotFound("Sub category value not found");
  }

  await subcategoryValue.destroy();

  return NextResponse.json({ data: subcategoryValue, deleted: true });
});
