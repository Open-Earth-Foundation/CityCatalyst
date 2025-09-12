/**
 * @swagger
 * /api/v0/organizations/{organization}:
 *   get:
 *     tags:
 *       - Organizations
 *     summary: Get a single organization with projects and theme (admin only).
 *     description: Returns the organization record with related projects and theme fields. Requires an admin session. Response is an object (not wrapped).
 *     parameters:
 *       - in: path
 *         name: organization
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Organization object.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               additionalProperties: true
 *       404:
 *         description: Organization not found.
 *   patch:
 *     tags:
 *       - Organizations
 *     summary: Update organization properties (admin only).
 *     description: Updates organization fields such as name and contactEmail. Requires an admin session. Response is the updated organization object (not wrapped).
 *     parameters:
 *       - in: path
 *         name: organization
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               contactEmail:
 *                 type: string
 *                 format: email
 *     responses:
 *       200:
 *         description: Organization updated.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               additionalProperties: true
 *       400:
 *         description: Cannot update default organization.
 *       404:
 *         description: Organization not found.
 *   delete:
 *     tags:
 *       - Organizations
 *     summary: Delete an organization (admin only).
 *     description: Deletes an organization unless it is the default. Requires an admin session. Response is { deleted: true } on success.
 *     parameters:
 *       - in: path
 *         name: organization
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Deletion flag.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 deleted: { type: boolean }
 *       400:
 *         description: Cannot delete default organization.
 *       404:
 *         description: Organization not found.
 */
import { Organization } from "@/models/Organization";
import { updateOrganizationRequest } from "@/util/validation";
import { apiHandler } from "@/util/api";
import { NextResponse } from "next/server";
import createHttpError from "http-errors";
import UserService from "@/backend/UserService";
import { db } from "@/models";
import { DEFAULT_ORGANIZATION_ID, DEFAULT_PROJECT_ID } from "@/util/constants";

export const GET = apiHandler(async (_req, { params, session }) => {
  const { organization: organizationId } = params;
  const org = await Organization.findByPk(organizationId as string, {
    include: [
      {
        model: db.models.Project,
        as: "projects",
        attributes: ["projectId", "name", "cityCountLimit"],
        include: [
          {
            model: db.models.City,
            as: "cities",
            attributes: ["cityId", "name"],
          },
        ],
      },
      {
        model: db.models.Theme,
        as: "theme",
      },
    ],
  });
  if (!org) {
    throw new createHttpError.NotFound("organization-not-found");
  }
  return NextResponse.json(org);
});

export const PATCH = apiHandler(async (req, { params, session }) => {
  const { organization: organizationId } = params;
  UserService.validateIsAdmin(session);

  if (organizationId === DEFAULT_ORGANIZATION_ID) {
    throw new createHttpError.BadRequest("Cannot update default organization");
  }
  const validatedData = updateOrganizationRequest.parse(await req.json());
  const org = await Organization.findByPk(organizationId as string);
  if (!org) {
    throw new createHttpError.NotFound("organization-not-found");
  } else {
    const newOrg = await org.update(validatedData);
    return NextResponse.json(newOrg);
  }
});

export const DELETE = apiHandler(async (req, { params, session }) => {
  UserService.validateIsAdmin(session);
  const { organization: organizationId } = params;

  if (organizationId === DEFAULT_ORGANIZATION_ID) {
    throw new createHttpError.BadRequest("Cannot delete default organization");
  }

  const org = await Organization.findByPk(organizationId as string);
  if (!org) {
    throw new createHttpError.NotFound("organization-not-found");
  }
  await org.destroy();
  return NextResponse.json({ deleted: true });
});
