import { db } from "@/models";
import { apiHandler } from "@/util/api";
import createHttpError from "http-errors";
import { NextResponse } from "next/server";
import { Op } from "sequelize";

export const GET = apiHandler(async (_req: Request, _context: {}) => {
  // don't return emissions factors from specific inventories
  const emissionsFactors = await db.models.EmissionsFactor.findAll({
    where: {
      inventoryId: { [Op.is]: null },
    },
  });
  if (emissionsFactors.length === 0) {
    throw new createHttpError.NotFound("Emissions factors not found");
  }

  return NextResponse.json({ data: emissionsFactors });
});
