import { db } from "@/models";
import { apiHandler } from "@/util/api";
import { createCityRequest, createPopulationRequest } from "@/util/validation";
import createHttpError from "http-errors";
import { Session } from "next-auth";
import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";

export const POST = apiHandler(
  async (
    req: Request,
    context: { session?: Session; params: Record<string, string> },
  ) => {
    const body = createPopulationRequest.parse(await req.json());
    if (!context.session) {
      throw new createHttpError.Unauthorized("Unauthorized");
    }

    const population = await db.models.Population.create({
      ...body,
    });
    return NextResponse.json({ data: population });
  },
);
