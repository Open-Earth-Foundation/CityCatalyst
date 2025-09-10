/**
 * @swagger
 * /api/v0/city/{city}/organization:
 *   get:
 *     tags:
 *       - City Organization
 *     summary: Get organization for a city
 *     parameters:
 *       - in: path
 *         name: city
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Organization details returned.
 *       404:
 *         description: City or organization not found.
 */
import { apiHandler } from "@/util/api";
import UserService from "@/backend/UserService";
import { db } from "@/models";
import createHttpError from "http-errors";
import { NextResponse } from "next/server";

export const GET = apiHandler(async (req, { session, params }) => {
  let cityId = params.city;

  const city = await UserService.findUserCity(
    cityId,
    session,
  );

  if (!city) {
    throw new createHttpError.NotFound("city not found");
  }

  const organization = city.project?.organization;

  if (!organization) {
    throw new createHttpError.NotFound("Organization not found");
  }
  let theme = null;
  if (organization.themeId) {
    theme = await db.models.Theme.findByPk(organization.themeId);
  }

  const response = {
    organizationId: organization.organizationId,
    organizationName: organization.name,
    logoUrl: organization.logoUrl,
    active: organization.active,
    theme: {
      themeId: theme?.themeId,
      themeKey: theme?.themeKey,
    },
  };

  return NextResponse.json(response);
});
