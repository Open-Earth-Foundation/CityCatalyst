import { db } from "@/models";
import { apiHandler } from "@/util/api";
import { createCityRequest } from "@/util/validation";
import createHttpError from "http-errors";
import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { logger } from "@/services/logger";
import { DEFAULT_PROJECT_ID } from "@/util/constants";

export const POST = apiHandler(async (req, { session }) => {
  const body = createCityRequest.parse(await req.json());
  if (!session) {
    throw new createHttpError.Unauthorized("Unauthorized");
  }

  const projectId = body.projectId;

  if (!projectId) {
    logger.info("Project ID is not provided, defaulting to Default Project");
    body.projectId = DEFAULT_PROJECT_ID;
  }

  const project = await db.models.Project.findByPk(body.projectId, {
    include: [
      {
        model: db.models.City,
        as: "cities",
      },
    ],
  });

  if (!project) {
    throw new createHttpError.NotFound("Project not found");
  }

  if (project.cities.length === project.cityCountLimit) {
    throw new createHttpError.BadRequest("city-count-limit-reached");
  }

  let city = await db.models.City.findOne({
    where: {
      locode: body.locode,
    },
    include: [
      {
        model: db.models.User,
        as: "users",
        required: true,
        where: {
          userId: session.user.id,
        },
      },
    ],
  });

  if (!city) {
    city = await db.models.City.create({
      cityId: randomUUID(),
      ...body,
    });
    await city.addUser(session.user.id);
  }

  return NextResponse.json({ data: city });
});

export const GET = apiHandler(async (_req, { session }) => {
  if (!session) {
    throw new createHttpError.Unauthorized("Unauthorized");
  }

  const cities = await db.models.City.findAll({
    include: [
      {
        model: db.models.User,
        as: "users",
        where: {
          userId: session.user.id,
        },
        attributes: ["userId"],
      },
    ],
  });

  if (!cities) {
    throw new createHttpError.NotFound("User cities not found");
  }

  return NextResponse.json({ data: cities });
});
