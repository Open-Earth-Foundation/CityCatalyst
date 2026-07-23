/**
 * @swagger
 * /api/v1/user/organizations:
 *   get:
 *     tags:
 *       - user
 *     operationId: getUserOrganizations
 *     summary: Get all organizations that a user is part of and their role in them
 *     description: Returns list of organizations for the currently signed in user and which role they have in each of them (admin role only for now)
 *     responses:
 *       200:
 *         description: List of organizations returned.
 *       401:
 *         description: Access denied, log in beforehand
 */
import { db } from "@/models";
import { apiHandler } from "@/util/api";
import { OrganizationRole } from "@/util/types";
import createHttpError from "http-errors";
import { NextResponse } from "next/server";

export const GET = apiHandler(async (_req, { session }) => {
  if (!session) {
    throw new createHttpError.Unauthorized(
      "Authentication required, need to log in",
    );
  }

  const organizationAdmins = await db.models.OrganizationAdmin.findAll({
    where: { userId: session.user.id },
    include: [
      {
        model: db.models.Organization,
        as: "organization",
        attributes: ["name"],
      },
    ],
  });
  const organizations = organizationAdmins.map((orgAdmin) => {
    return {
      organizationId: orgAdmin.organizationId,
      name: orgAdmin.organization.name,
      role: OrganizationRole.ORG_ADMIN,
    };
  });

  return NextResponse.json({ data: organizations });
});
