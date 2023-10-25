import { db } from "@/models";
import { apiHandler } from "@/util/api";
import { createSubCategory, createSubSectorRequest } from "@/util/validation";
import createHttpError from "http-errors";
import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";

export const POST = apiHandler(async (req: NextRequest, { params }) => {
  const body = createSubCategory.parse(await req.json());

  const city = await db.models.City.findOne({ where: { locode: params.city } });
  if (!city) {
    throw new createHttpError.NotFound("City not found");
  }

  const subcategory = await db.models.SubCategory.create({
    subcategoryId: randomUUID(),
    ...body,
  });

  return NextResponse.json({ data: subcategory });
});
