import PopulationService from "@/backend/PopulationService";
import UserService from "@/backend/UserService";
import { apiHandler } from "@/util/api";
import createHttpError from "http-errors";
import { NextResponse } from "next/server";

export const GET = apiHandler(async (req, { params, session }) => {
  const { inventory: inventoryId } = params;
  if (!inventoryId) {
    throw new createHttpError.BadRequest("inventoryId is required!");
  }

  const inventory = await UserService.findUserInventory(
    params.inventory,
    session,
  );

  if (!inventory) {
    throw new createHttpError.NotFound("Inventory not found");
  }

  const populations = await PopulationService.getPopulationDataForCityYear(
    inventory.cityId!,
    inventory.year!,
  );
  return NextResponse.json({ data: populations });
});
