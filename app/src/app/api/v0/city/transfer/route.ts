// patch route to move cities to different projects
import { apiHandler } from "@/util/api";

import createHttpError from "http-errors";
import { transferCitiesRequest } from "@/util/validation";
import UserService from "@/backend/UserService";
import { db } from "@/models";
import { NextResponse } from "next/server";
import EmailService from "@/backend/EmailService";

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

    // confirm project exists
    const project = await db.models.Project.findByPk(body.projectId, {
      transaction: t,
      include: [
        {
          model: db.models.City,
          as: "cities",
          attributes: ["cityId"],
        },
        {
          model: db.models.Organization,
          as: "organization",
          attributes: ["organizationId", "name", "logoUrl"],
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
      throw new createHttpError.NotFound(
        `Project not found for ID: ${body.projectId}`,
      );
    }

    const newCityCount = body.cityIds.filter(
      (id) => !project.cities.map((city) => city.cityId).includes(id),
    ).length;
    const isValidTransfer =
      Number(project.cities.length + newCityCount) <=
      Number(project.cityCountLimit);

    // check if project city count limit is reached or will be with the new ci

    if (!isValidTransfer) {
      throw new createHttpError.BadRequest(`project-city-count-limit-exceeded`);
    }

    await db.models.City.update(
      { projectId: body.projectId },
      {
        where: { cityId: body.cityIds },
        transaction: t,
      },
    );

    // Notify admin users about the transfer
    const admins = await db.models.OrganizationAdmin.findAll({
      where: {
        organizationId: project.organizationId,
      },
      include: [
        {
          model: db.models.User,
          as: "user",
          attributes: ["email", "name"],
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
      cities: cities,
    });
  });

  return NextResponse.json({ success: true });
});
