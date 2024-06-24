import { db } from "@/models";
import { apiHandler } from "@/util/api";
import createHttpError from "http-errors";
import { NextResponse } from "next/server";

export const GET = apiHandler(async (_req, { session }) => {
  if (!session) {
    throw new createHttpError.Unauthorized("Unauthorized");
  }

  return NextResponse.json({
    data: [
      {
        id: 1,
        buildingTpe: "Commercial building",
        fuelType: "All Fuels",
        dataQuality: "Medium",
        fuelConsumption: 24.4,
        emissions: 1000,
      },
      {
        id: 2,
        buildingTpe: "Commercial building",
        fuelType: "Natural Gas",
        dataQuality: "Medium",
        fuelConsumption: 134.4,
        emissions: 2000,
      },
      {
        id: 3,
        buildingTpe: "Commercial building",
        fuelType: "Natural Gas",
        dataQuality: "Medium",
        fuelConsumption: 134.4,
        emissions: 2000,
      },
    ],
  });
});

export const POST = apiHandler(async (_req, { session }) => {
  if (!session) {
    throw new createHttpError.Unauthorized("Unauthorized");
  }

  return NextResponse.json({ data: "Users" });
});
