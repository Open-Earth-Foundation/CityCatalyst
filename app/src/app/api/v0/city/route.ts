import { db } from "@/models";
import { apiHandler } from "@/util/api";
import { createCityRequest } from "@/util/validation";
import createHttpError from "http-errors";
import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { logger } from "@/services/logger";
import { DEFAULT_PROJECT_ID } from "@/util/constants";
import EmailService from "@/backend/EmailService";

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
      {
        model: db.models.Organization,
        as: "organization",
        attributes: ["organizationId", "name", "logoUrl", "active"],
        include: [
          {
            model: db.models.Theme,
            as: "theme",
          },
        ],
      },
    ],
  });

  if (!project) {
    throw new createHttpError.NotFound("Project not found");
  }

  if (!project.organization.active) {
    throw new createHttpError.Forbidden("Organization is not active");
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
    // we need to add an email notification here for all the admins of the organization
    const admins = await db.models.OrganizationAdmin.findAll({
      where: {
        organizationId: project.organizationId,
      },
      include: [
        {
          model: db.models.User,
          as: "user",
          attributes: ["email", "name", "preferredLanguage"],
        },
      ],
    });

    // fire and forget email notification to all admins
    EmailService.sendCityAddedNotification({
      users: admins.map((admin) => admin.user),
      brandInformation: {
        color: project.organization.theme?.primaryColor,
        logoUrl: project.organization.logoUrl || "",
      },
      project: project,
      organizationName: project.organization.name as string,
      cities: [city],
    });
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
