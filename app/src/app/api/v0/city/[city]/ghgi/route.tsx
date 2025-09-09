import { NextResponse } from "next/server";

import { apiHandler } from "@/util/api";
import { db } from "@/models";
import createHttpError from "http-errors";
import UserService from "@/backend/UserService";
import { upsertInventoryRequest } from "@/util/validation";
import { QueryTypes } from "sequelize";
import { validate } from "uuid";
import { InventoryService } from "@/backend/InventoryService";

export const GET = apiHandler(async (req, { session, params }) => {
  let cityId = params.city;

  if (cityId === "null") {
    throw new createHttpError.BadRequest("'null' is an invalid city id");
  }

  if ("default" === cityId) {
    cityId = await UserService.findUserDefaultCity(session);
    if (!cityId) {
      throw new createHttpError.NotFound("user has no default city");
    }
  }

  if (!validate(cityId)) {
    throw new createHttpError.BadRequest(
      `'${cityId}' is not a valid city id (uuid)`,
    );
  }

  const inventoryId = await InventoryService.getInventoryIdByCityId(cityId);

  const inventory = await InventoryService.getInventoryWithTotalEmissions(
    inventoryId,
    session,
  );
  return NextResponse.json({ data: inventory });
});
