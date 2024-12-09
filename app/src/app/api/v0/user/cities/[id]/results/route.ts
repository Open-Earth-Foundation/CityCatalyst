// return the year over year statistics for inventories attached to the city for this user

import { apiHandler } from "@/util/api";
import { NextRequest, NextResponse } from "next/server";
import createHttpError from "http-errors";
import { db } from "@/models";
import { getEmissionResultsBatch } from "@/backend/ResultsService";

export const GET = apiHandler(async (_req: NextRequest, context) => {
  const { id } = context.params;
  if (!context.session) {
    throw new createHttpError.Unauthorized("Unauthorized");
  }

  const city = await db.models.City.findOne({
    where: {
      cityId: id,
    },
    include: [
      {
        model: db.models.Inventory,
        as: "inventories",
        attributes: ["inventoryId", "year"],
      },
    ],
  });

  if (!city) {
    throw new createHttpError.NotFound("City not found");
  }

  const EmissionResults = await getEmissionResultsBatch(
    city.inventories.map((i) => i.inventoryId),
  );

  return NextResponse.json({ data: EmissionResults });
});
