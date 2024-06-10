import { db } from "@/models";
import type { City } from "@/models/City";
import type { Inventory } from "@/models/Inventory";
import { apiHandler } from "@/util/api";
import createHttpError from "http-errors";
import { NextRequest, NextResponse } from "next/server";

export const GET = apiHandler(async (_req: NextRequest, context) => {
  if (!context.session) {
    throw new createHttpError.Unauthorized("Unauthorized");
  }

  const user = await db.models.User.findOne({
    attributes: [],
    where: {
      userId: context.session.user.id,
    },
    include: [
      {
        model: db.models.City,
        as: "cities",
        include: [
          {
            model: db.models.Inventory,
            as: "inventories",
          },
        ],
      },
    ],
  });

  if (!user) {
    throw new createHttpError.NotFound("User not found");
  }

  const data = user.cities.flatMap((city: City) => {
    return city.inventories.map((inventory: Inventory) => {
      return {
        ...inventory.dataValues,
        city: { name: city.name, locode: city.locode },
      };
    });
  });

  return NextResponse.json({ data });
});
