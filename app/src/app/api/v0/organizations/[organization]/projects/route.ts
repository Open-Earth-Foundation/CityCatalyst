/**
 * @swagger
 * /api/v0/organizations/{organization}/projects:
 *   get:
 *     tags:
 *       - Organization Projects
 *     summary: List projects for an organization (context-aware)
 *     parameters:
 *       - in: path
 *         name: organization
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Projects returned.
 *   post:
 *     tags:
 *       - Organization Projects
 *     summary: Create a project in an organization
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
 *         description: Project created.
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

export const GET = apiHandler(async (req, { params, session }) => {
  // this will behave differently for different users
  const { organization: organizationId } = params;
  const projects = await UserService.findUserProjectsAndCitiesInOrganization(
    organizationId,
    session,
  );
  return NextResponse.json(projects);
});
