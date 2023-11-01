import { db } from "@/models";
import { apiHandler } from "@/util/api";
import { createSubCategory } from "@/util/validation";
import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";

export const POST = apiHandler(async (req: NextRequest, { params }) => {
  const body = createSubCategory.parse(await req.json());

  const subcategoryValue = await db.models.SubCategoryValue.create({
    subcategoryValueId: randomUUID(),
    inventoryId: params.inventory,
    ...body,
  });

  return NextResponse.json({ data: subcategoryValue });
});
