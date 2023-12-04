import { db } from "@/models";
import { apiHandler } from "@/util/api";
import createHttpError from "http-errors";
import { Session } from "next-auth";
import { NextRequest, NextResponse } from "next/server";

export const GET = apiHandler(
  async (
    _req: NextRequest,
    context: { session?: Session; params: Record<string, string> },
  ) => {
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

    const data = user.cities.flatMap((city) => {
      return city.inventories.map((inventory) => {
        return { ...inventory.dataValues, city: { name: city.name, locode: city.locode } };
      });
    });

    return NextResponse.json({ data });
  },
);
