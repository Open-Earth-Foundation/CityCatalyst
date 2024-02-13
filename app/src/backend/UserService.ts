import { db } from "@/models";
import createHttpError from "http-errors";

import type { AppSession } from "@/lib/auth";
import type { City } from "@/models/City";
import type { Inventory } from "@/models/Inventory";
import type { User } from "@/models/User";
import type { Includeable } from "sequelize";

export default class UserService {
  public static async findUser(
    userId: string,
    session: AppSession | null,
    include?: Includeable | Includeable[],
  ): Promise<User> {
    if (!session || userId !== session.user.id) {
      throw new createHttpError.Unauthorized(
        "Not signed in as the requested user",
      );
    }

    const user = await db.models.User.findOne({ where: { userId }, include });
    if (!user) {
      throw new createHttpError.NotFound("User not found");
    }

    return user;
  }
  /**
   * Load city information and perform access control
   */
  public static async findUserCity(
    cityId: string,
    session: AppSession | null,
  ): Promise<City> {
    if (!session) throw new createHttpError.Unauthorized("Unauthorized");
    const city = await db.models.City.findOne({
      where: { cityId },
      include: [
        {
          model: db.models.User,
          as: "users",
          where: {
            userId: session?.user.id,
          },
        },
      ],
    });

    if (!city) {
      throw new createHttpError.NotFound("City not found");
    }
    if (city.users.length === 0) {
      throw new createHttpError.Unauthorized("User is not part of this city");
    }

    return city;
  }

  /**
   * Load inventory information and perform access control
   */
  public static async findUserInventory(
    inventoryId: string,
    session: AppSession | null,
  ): Promise<Inventory> {
    if (!session) throw new createHttpError.Unauthorized("Unauthorized");
    const inventory = await db.models.Inventory.findOne({
      where: { inventoryId },
      include: [
        {
          model: db.models.City,
          as: "city",
          include: [
            {
              model: db.models.User,
              as: "users",
              where: {
                userId: session?.user.id,
              },
            },
          ],
        },
      ],
    });
    if (!inventory) {
      throw new createHttpError.NotFound("Inventory not found");
    }
    if (inventory.city.users.length === 0) {
      throw new createHttpError.Unauthorized(
        "User is not part of this inventory's city",
      );
    }

    return inventory;
  }
}
