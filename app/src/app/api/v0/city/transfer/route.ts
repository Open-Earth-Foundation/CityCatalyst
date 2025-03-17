// patch route to move cities to different projects
import { apiHandler } from "@/util/api";

import createHttpError from "http-errors";
import { transferCitiesRequest } from "@/util/validation";
import UserService from "@/backend/UserService";
import { db } from "@/models";
import { NextResponse } from "next/server";

// endpoint should take an array of city ids and a project id to move it to.

export const PATCH = apiHandler(async (req, { session }) => {
  UserService.validateIsAdmin(session);

  const body = transferCitiesRequest.parse(await req.json());

  if (!db.sequelize) throw new Error("Database not initialized");
  //  set up a transaction to move the cities to the new project
  await db.sequelize.transaction(async (t) => {
    const cities = await db.models.City.findAll({
      where: { cityId: body.cityIds },
      transaction: t,
    });

    const foundCityIds = cities.map((city) => city.cityId);
    const missingCityIds = body.cityIds.filter(
      (id) => !foundCityIds.includes(id),
    );

    if (missingCityIds.length > 0) {
      throw new createHttpError.NotFound(
        `Cities not found for IDs: ${missingCityIds.join(", ")}`,
      );
    }

    await db.models.City.update(
      { projectId: body.projectId },
      {
        where: { cityId: body.cityIds },
        transaction: t,
      },
    );
  });

  return NextResponse.json({ success: true });
});
