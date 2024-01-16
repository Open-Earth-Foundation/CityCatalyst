import { db } from "@/models";
import { apiHandler } from "@/util/api";
import createHttpError from "http-errors";
import { NextRequest, NextResponse } from "next/server";
import { Op } from "sequelize";

export const GET = apiHandler(async (req: NextRequest, { params }) => {
  const subCategoryIdsParam = req.nextUrl.searchParams.get("subCategoryIds");
  if (!subCategoryIdsParam || subCategoryIdsParam.length === 0) {
    throw new createHttpError.BadRequest(
      "Query parameter subCategoryIds is required!",
    );
  }
  const subCategoryIds = subCategoryIdsParam.split(",");

  const inventoryValue = await db.models.InventoryValue.findOne({
    where: {
      subCategoryId: { [Op.in]: subCategoryIds },
      inventoryId: params.inventory,
    },
    include: [
      { model: db.models.DataSource, as: "dataSource" },
      { model: db.models.GasValue, as: "gasValues" },
    ],
  });

  if (!inventoryValue) {
    throw new createHttpError.NotFound("Inventory value not found");
  }

  return NextResponse.json({ data: inventoryValue });
});
