import UserService from "@/backend/UserService";
import { apiHandler } from "@/util/api";
import { createCityRequest } from "@/util/validation";
import { NextResponse } from "next/server";
import { Inventory } from "@/models/Inventory";
import { User } from "@/models/User";
import { db } from "@/models";
import { QueryTypes } from "sequelize";

export const GET = apiHandler(async (_req, { params, session }) => {
  const city = await UserService.findUserCity(params.city, session, true);
  return NextResponse.json({ data: city });
});

export const DELETE = apiHandler(async (_req, { params, session }) => {
  const city = await UserService.findUserCity(params.city, session);
  const userId = session!.user.id;
  const currentDefaultInventory = await User.findOne({
    attributes: [],
    where: {
      userId,
    },
    include: [
      {
        model: Inventory,
        as: "defaultInventory",
        attributes: ["cityId"],
      },
    ],
  });

  const currentDefaultCityId =
    currentDefaultInventory?.defaultInventory?.cityId;
  if (currentDefaultCityId === params.city) {
    const rawQuery = `
        SELECT i.inventory_id
        FROM "CityUser" cu
                 JOIN "City" c ON c.city_id = cu.city_id
                 JOIN "Inventory" i ON i.city_id = c.city_id
        WHERE cu.user_id = :userId
          AND cu.city_id != :cityId
        LIMIT 1;
    `;
    const nextDefaultInventory: { inventory_id: string }[] =
      await db.sequelize!.query(rawQuery, {
        replacements: { userId, cityId: currentDefaultCityId },
        type: QueryTypes.SELECT,
      });

    if (nextDefaultInventory.length > 0) {
      const inventoryId = nextDefaultInventory[0].inventory_id;

      await User.update(
        { defaultInventoryId: inventoryId },
        { where: { userId } },
      );
    }
  }
  await city.destroy();
  return NextResponse.json({ data: city, deleted: true });
});

export const PATCH = apiHandler(async (req, { params, session }) => {
  const body = createCityRequest.parse(await req.json());
  let city = await UserService.findUserCity(params.city, session);
  city = await city.update(body);
  return NextResponse.json({ data: city });
});
