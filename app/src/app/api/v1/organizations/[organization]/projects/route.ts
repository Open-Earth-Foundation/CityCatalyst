/**
 * @swagger
 * /api/v1/organizations/{organization}/projects:
 *   post:
 *     tags:
 *       - Organization Projects
 *     operationId: postOrganizationProjects
 *     summary: Create a new project in the organization (admin only).
 *     description: Creates a project with a name and cityCountLimit and notifies organization admins. Requires an admin session. Response is the created project (not wrapped).
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
 *             required: [name, cityCountLimit]
 *             properties:
 *               name:
 *                 type: string
 *               cityCountLimit:
 *                 type: integer
 *                 minimum: 1
 *               description:
 *                 type: string
 *     responses:
 *       200:
 *         description: Project object.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 projectId:
 *                   type: string
 *                   format: uuid
 *                 name:
 *                   type: string
 *                 description:
 *                   type: string
 *                   nullable: true
 *                 organizationId:
 *                   type: string
 *                   format: uuid
 *                 created:
 *                   type: string
 *                   format: date-time
 *                 lastUpdated:
 *                   type: string
 *                   format: date-time
 *       404:
 *         description: Organization not found.
 */
// creates a new project and lists all projects belonging to an organization

import { Project } from "@/models/Project";
import { createProjectRequest } from "@/util/validation";

import { apiHandler } from "@/util/api";
import { NextResponse } from "next/server";

import UserService from "@/backend/UserService";
import { randomUUID } from "node:crypto";
import { db } from "@/models";
import EmailService from "@/backend/EmailService";
import createHttpError from "http-errors";
import { Organization } from "@/models/Organization";

export const POST = apiHandler(async (req, { params, session }) => {
  UserService.validateIsAdmin(session);
  const { organization: organizationId } = params;

  const organization = await Organization.findByPk(organizationId);

  if (!organization) {
    throw createHttpError.NotFound("organization-not-found");
  }

  const validatedData = createProjectRequest.parse(await req.json());
  const project = await Project.create({
    projectId: randomUUID(),
    ...validatedData,
    organizationId,
  });

  // send email to the admins in the organization that a new project was added.
  const admins = await db.models.OrganizationAdmin.findAll({
    where: { organizationId },
    include: { model: db.models.User, as: "user" },
  });

  const users = admins.map((admin) => admin?.user).filter((user) => user);
  await EmailService.sendProjectCreationNotificationEmail({
    project,
    organizationName: organization.name as string,
    users,
  });

  return NextResponse.json(project);
});
/**
 * @swagger
 * /api/v1/organizations/{organization}/projects:
 *   get:
 *     tags:
 *       - Organization Projects
 *     operationId: getOrganizationProjects
 *     summary: List projects for an organization visible to the current user.
 *     description: Returns the projects in the organization filtered by the user’s access (admin, org admin, project admin, or city membership). Requires a signed‑in session. Response is a JSON array or context object (not wrapped).
 *     parameters:
 *       - in: path
 *         name: organization
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Projects visible to the user.
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   projectId:
 *                     type: string
 *                     format: uuid
 *                   name:
 *                     type: string
 *                   description:
 *                     type: string
 *                     nullable: true
 *                   created:
 *                     type: string
 *                     format: date-time
 *
 */
export const GET = apiHandler(async (req, { params, session }) => {
  // this will behave differently for different users
  const { organization: organizationId } = params;
  const projects = await UserService.findUserProjectsAndCitiesInOrganization(
    organizationId,
    session,
  );
  return NextResponse.json(projects);
});
