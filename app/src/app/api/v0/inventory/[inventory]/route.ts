import { NextResponse } from "next/server";

import { apiHandler } from "@/util/api";
import { db } from "@/models";
import createHttpError from "http-errors";

export const GET = apiHandler(async (req, { params }) => {
  const { inventory: inventoryId } = params;
  const inventory = await db.models.Inventory.findByPk(inventoryId, {
    include: [{ model: db.models.City, as: "city" }],
  });
  if (!inventory) {
    throw new createHttpError.NotFound("Inventory not found");
  }

  return NextResponse.json({ data: inventory });
});
