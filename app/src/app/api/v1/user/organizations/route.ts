/**
 * @swagger
 * /api/v1/user/organizations:
 *   get:
 *     tags:
 *       - user
 *     operationId: getUserOrganizations
 *     summary: Get all organizations that a user is part of and their role in them
 *     description: Returns organizations the signed-in user can access. Platform admins receive every organization. Other users receive organizations they administer, plus those they reach through project-admin or city membership.
 *     responses:
 *       200:
 *         description: List of organizations returned.
 *       401:
 *         description: Access denied, log in beforehand
 */
import { db } from "@/models";
import { apiHandler } from "@/util/api";
import { OrganizationRole, Roles } from "@/util/types";
import createHttpError from "http-errors";
import { NextResponse } from "next/server";

type UserOrganization = {
  organizationId: string;
  name: string;
  role: OrganizationRole;
};

export const GET = apiHandler(async (_req, { session }) => {
  if (!session) {
    throw new createHttpError.Unauthorized(
      "Authentication required, need to log in",
    );
  }

  // Platform admins can switch into any organization, not only ones they belong to.
  if (session.user.role === Roles.Admin) {
    const allOrganizations = await db.models.Organization.findAll({
      attributes: ["organizationId", "name"],
      order: [["name", "ASC"]],
    });
    return NextResponse.json({
      data: allOrganizations.map((organization) => ({
        organizationId: organization.organizationId,
        name: organization.name,
        role: OrganizationRole.ADMIN,
      })),
    });
  }

  const organizationsById = new Map<string, UserOrganization>();

  const addOrganization = (
    organizationId: string | undefined,
    name: string | undefined,
    role: OrganizationRole,
  ) => {
    if (!organizationId || !name || organizationsById.has(organizationId)) {
      return;
    }
    organizationsById.set(organizationId, {
      organizationId,
      name,
      role,
    });
  };

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
  for (const orgAdmin of organizationAdmins) {
    addOrganization(
      orgAdmin.organizationId,
      orgAdmin.organization?.name,
      OrganizationRole.ORG_ADMIN,
    );
  }

  const projectAdmins = await db.models.ProjectAdmin.findAll({
    where: { userId: session.user.id },
    include: [
      {
        model: db.models.Project,
        as: "project",
        attributes: ["organizationId"],
        include: [
          {
            model: db.models.Organization,
            as: "organization",
            attributes: ["name"],
          },
        ],
      },
    ],
  });
  for (const projectAdmin of projectAdmins) {
    addOrganization(
      projectAdmin.project?.organizationId,
      projectAdmin.project?.organization?.name,
      OrganizationRole.ADMIN,
    );
  }

  const cityUsers = await db.models.CityUser.findAll({
    where: { userId: session.user.id },
    include: [
      {
        model: db.models.City,
        as: "city",
        attributes: ["projectId"],
        include: [
          {
            model: db.models.Project,
            as: "project",
            attributes: ["organizationId"],
            include: [
              {
                model: db.models.Organization,
                as: "organization",
                attributes: ["name"],
              },
            ],
          },
        ],
      },
    ],
  });
  for (const cityUser of cityUsers) {
    addOrganization(
      cityUser.city?.project?.organizationId,
      cityUser.city?.project?.organization?.name,
      OrganizationRole.COLLABORATOR,
    );
  }

  return NextResponse.json({ data: [...organizationsById.values()] });
});
