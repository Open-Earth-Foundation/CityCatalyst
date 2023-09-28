import { db } from "@/models";
import { apiHandler } from "@/util/api";
import { createCityRequest } from "@/util/validation";
import createHttpError from "http-errors";
import { Session } from "next-auth";
import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";

export const POST = apiHandler(
  async (
    req: Request,
    context: { session?: Session; params: Record<string, string> },
  ) => {
    const body = createCityRequest.parse(await req.json());
    console.log("context: ", context);
    if (!context.session)
      throw new createHttpError.Unauthorized("Must be logged in");
    const city = await db.models.City.create({
      cityId: randomUUID(),
      ...body,
    });
    return NextResponse.json({ data: city });
  },
);
