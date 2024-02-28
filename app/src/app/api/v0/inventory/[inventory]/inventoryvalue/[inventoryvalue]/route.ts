import UserService from "@/backend/UserService";
import { db } from "@/models";
import { apiHandler } from "@/util/api";
import createHttpError from "http-errors";
import { NextResponse } from "next/server";

export const GET = apiHandler(async (req, { params, session }) => {
  const inventoryValue = await UserService.findUserInventoryValue(
    params.inventoryvalue,
    params.inventory,
    session,
  );

  console.log(inventoryValue);

  return NextResponse.json({ data: inventoryValue });
});

export const DELETE = apiHandler(async (req, { params, session }) => {
  const inventoryValue = await UserService.findUserInventoryValue(
    params.inventoryvalue,
    params.inventory,
    session,
  );

  await inventoryValue.destroy();

  return NextResponse.json({ data: inventoryValue, deleted: true });
});
