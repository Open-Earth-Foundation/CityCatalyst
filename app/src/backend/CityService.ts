import { db } from "@/models";
import { City } from "@/models/City";
import createHttpError from "http-errors";
import { Session } from "next-auth";

export default class CityService {
  /**
   * Load city information and perform access control
   */ 
  public static async findUserCity(
    cityId: string,
    session: Session | undefined,
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
      throw new createHttpError.Unauthorized("User is not part of this city");
    }

    return city;
  }
}
