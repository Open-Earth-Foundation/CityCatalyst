/**
 * @swagger
 * /api/v0/city/{city}/organization:
 *   get:
 *     tags:
 *       - City Organization
 *     summary: Get organization branding and status for a city.
 *     description: Returns the organization identifier, name, logo URL, active flag, and theme info for the city’s project. Requires a signed‑in user with access to the city. Response is a plain object (not wrapped in data).
 *     parameters:
 *       - in: path
 *         name: city
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Organization details.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 organizationId: { type: string, format: uuid }
 *                 organizationName: { type: string }
 *                 logoUrl: { type: string }
 *                 active: { type: boolean }
 *                 theme:
 *                   type: object
 *                   properties:
 *                     themeId: { type: string }
 *                     themeKey: { type: string }
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
