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

  //  set up a transaction to move the cities to the new project
  await db.sequelize?.transaction(async (t) => {
    for (const cityId of body.cityIds) {
      const city = await db.models.City.findOne({
        where: {
          cityId,
        },
      });

      if (!city) {
        throw new createHttpError.NotFound("City not found for id: " + cityId);
      }

      await city.update({ projectId: body.projectId }, { transaction: t });
    }
  });

  return NextResponse.json({ success: true });
});
