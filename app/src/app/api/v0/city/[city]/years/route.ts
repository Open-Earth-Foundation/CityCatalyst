// fetch the years of the inventories attached to a city

import { apiHandler } from "@/util/api";
import { NextRequest, NextResponse } from "next/server";
import createHttpError from "http-errors";
import { db } from "@/models";

export const GET = apiHandler(async (_req: NextRequest, { params }) => {
  // TODO implement access control (check if inventory is public)
  /* if (!context.session && !inventory.isPublic) {
    throw new createHttpError.Unauthorized("Unauthorized");
  } */

  const city = await db.models.City.findByPk(params.city, {
    include: [
      {
        model: db.models.Inventory,
        as: "inventories",
        attributes: ["year", "inventoryId", "lastUpdated"],
      },
    ],
  });

  if (!city) {
    throw new createHttpError.NotFound("City not found");
  }

  return NextResponse.json({
    data: {
      city: {
        name: city.name,
        locode: city.locode,
        area: city.area,
        country: city.country,
        countryLocode: city.countryLocode,
        region: city.region,
        regionLocode: city.regionLocode,
        cityId: city.cityId,
      },
      years: city.inventories.map((inventory) => ({
        year: inventory.year,
        inventoryId: inventory.inventoryId,
        lastUpdate: inventory.lastUpdated,
      })),
    },
  });
});
