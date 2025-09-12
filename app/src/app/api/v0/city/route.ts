/**
 * @swagger
 * /api/v0/city:
 *   get:
 *     tags:
 *       - City
 *     summary: List cities that the current user is a member of.
 *     description: Returns all cities linked to the authenticated user via CityUser membership. Requires a signed‑in session; unauthorized users receive 401. Response is wrapped in { data: City[] }.
 *     responses:
 *       200:
 *         description: Cities wrapped in data.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       cityId: { type: string, format: uuid }
 *                       name: { type: string }
 *                       locode: { type: string }
 *                     additionalProperties: true
 *             examples:
 *               example:
 *                 value:
 *                   data:
 *                     - cityId: "11111111-1111-1111-1111-111111111111"
 *                       name: "Sample City"
 *                       locode: "US-XXX"
 *       401:
 *         description: Unauthorized.
 *   post:
 *     tags:
 *       - City
 *     summary: Create a new city within a permitted project.
 *     description: Creates a city associated to a project the user can manage, adds the current user to it, and triggers admin notifications. Requires a signed‑in session and project‑level permission. Returns the created (or existing) city in { data }.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [locode, name]
 *             properties:
 *               locode:
 *                 type: string
 *               name:
 *                 type: string
 *               shape:
 *                 type: object
 *                 nullable: true
 *               country:
 *                 type: string
 *                 nullable: true
 *               region:
 *                 type: string
 *                 nullable: true
 *               countryLocode:
 *                 type: string
 *                 nullable: true
 *               regionLocode:
 *                 type: string
 *                 nullable: true
 *               area:
 *                 type: integer
 *                 nullable: true
 *               projectId:
 *                 type: string
 *                 format: uuid
 *                 nullable: true
 *     responses:
 *       200:
 *         description: City wrapped in data.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     cityId: { type: string, format: uuid }
 *                     name: { type: string }
 *                     locode: { type: string }
 *                   additionalProperties: true
 *             examples:
 *               example:
 *                 value:
 *                   data:
 *                     cityId: "22222222-2222-2222-2222-222222222222"
 *                     name: "New City"
 *                     locode: "US-YYY"
 *       401:
 *         description: Unauthorized.
 *       404:
 *         description: Project not found.
 */
import { db } from "@/models";
import { apiHandler } from "@/util/api";
import { createCityRequest } from "@/util/validation";
import createHttpError from "http-errors";
import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { logger } from "@/services/logger";
import { DEFAULT_PROJECT_ID } from "@/util/constants";
import EmailService from "@/backend/EmailService";
import UserService from "@/backend/UserService";
import { PermissionService } from "@/backend/permissions/PermissionService";
import { Project } from "@/models/Project";

export const POST = apiHandler(async (req, { session }) => {
  const body = createCityRequest.parse(await req.json());
  if (!session) {
    throw new createHttpError.Unauthorized("Unauthorized");
  }

  const projectId = body.projectId;

  if (!projectId) {
    logger.info("Project ID is not provided, defaulting to Default Project ");
    body.projectId = DEFAULT_PROJECT_ID;
  }

  // Check permission to create city in this project (ORG_ADMIN or PROJECT_ADMIN required)
  const { resource } = await PermissionService.canCreateCity(
    session,
    body.projectId as string,
  );

  const project = resource as Project;

  if (!project) {
    throw new createHttpError.NotFound("Project not found");
  }

  // Load additional project data needed for the rest of the function
  await project.reload({
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

  if (Number(project.cities.length) >= Number(project.cityCountLimit)) {
    logger.error(
      `City count limit reached for project ${project.projectId}. Current count: ${project?.cities?.length}, Limit: ${project?.cityCountLimit}`,
    );
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

    // Update user defaults to include the newly created city
    try {
      await UserService.updateDefaults(session.user.id);
      logger.info(
        `Updated user defaults for user ${session.user.id} after city creation`,
      );
    } catch (error) {
      logger.error(
        { error, userId: session.user.id },
        "Failed to update user defaults after city creation",
      );
      // Don't fail the city creation if updating defaults fails
    }
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
