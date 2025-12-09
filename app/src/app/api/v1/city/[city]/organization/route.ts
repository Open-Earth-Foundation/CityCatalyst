/**
 * @swagger
 * /api/v1/city/{city}/organization:
 *   get:
 *     tags:
 *       - City Organization
 *     operationId: getCityCityOrganization
 *     summary: Get organization details and branding for a city.
 *     description: Retrieves organization information including identifier, name, logo URL, active status, and theme configuration for the city's project. Theme data includes both custom themes and default styling. Requires a signed‑in user with access to the city. Response is returned as a plain object (not wrapped in data).
 *     parameters:
 *       - in: path
 *         name: city
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: City ID for which to retrieve organization information
 *     responses:
 *       200:
 *         description: Organization details.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 organizationId:
 *                   type: string
 *                   format: uuid
 *                 organizationName:
 *                   type: string
 *                 logoUrl:
 *                   type: string
 *                   format: uri
 *                   nullable: true
 *                   description: URL to organization logo image
 *                 active:
 *                   type: boolean
 *                   description: Whether the organization is currently active
 *                 theme:
 *                   type: object
 *                   properties:
 *                     themeId:
 *                       type: string
 *                       format: uuid
 *                       nullable: true
 *                       description: Theme ID if a custom theme is configured
 *                     themeKey:
 *                       type: string
 *                       nullable: true
 *                       description: Theme key for styling configuration
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

  const city = await UserService.findUserCity(cityId, session);

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