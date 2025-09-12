/**
 * @swagger
 * /api/v0/projects/{project}:
 *   get:
 *     tags:
 *       - Projects
 *     summary: Get a single project by ID (admin only).
 *     description: Returns the project object for the given ID. Requires an admin session; non‑admins receive an authorization error. Response is the project object (not wrapped).
 *     parameters:
 *       - in: path
 *         name: project
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Project object.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               additionalProperties: true
 *       404:
 *         description: Project not found.
 *   patch:
 *     tags:
 *       - Projects
 *     summary: Update a project (admin only).
 *     description: Modifies project properties, and if cityCountLimit changes, notifies organization admins. Requires an admin session. Response is the updated project object (not wrapped).
 *     parameters:
 *       - in: path
 *         name: project
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
 *               cityCountLimit:
 *                 type: integer
 *                 minimum: 1
 *               description:
 *                 type: string
 *     responses:
 *       200:
 *         description: Updated project object.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               additionalProperties: true
 *       400:
 *         description: Invalid request or default project cannot be updated.
 *       404:
 *         description: Project not found.
 *   delete:
 *     tags:
 *       - Projects
 *     summary: Delete a project (admin only).
 *     description: Deletes the project and its cities, then emails organization admins about the deletion. Requires an admin session; default project cannot be deleted. Response is { deleted: true }.
 *     parameters:
 *       - in: path
 *         name: project
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
 *         description: Cannot delete default project.
 *       404:
 *         description: Project not found.
 */
import { apiHandler } from "@/util/api";
import UserService from "@/backend/UserService";
import { Project } from "@/models/Project";
import createHttpError from "http-errors";
import { NextResponse } from "next/server";
import { updateProjectRequest } from "@/util/validation";
import { City } from "@/models/City";
import { db } from "@/models";
import EmailService from "@/backend/EmailService";
import { DEFAULT_PROJECT_ID } from "@/util/constants";

export const GET = apiHandler(async (req, { params, session }) => {
  // return a single project.
  UserService.validateIsAdmin(session);
  const { project: projectId } = params;
  const project = await Project.findByPk(projectId as string);
  if (!project) {
    throw new createHttpError.NotFound("project-not-found");
  }
  return NextResponse.json(project);
});

// update a project
export const PATCH = apiHandler(async (req, { params, session }) => {
  UserService.validateIsAdmin(session);
  const { project: projectId } = params;

  if (projectId === DEFAULT_PROJECT_ID) {
    throw new createHttpError.BadRequest("Cannot update default project");
  }

  const validatedData = updateProjectRequest.parse(await req.json());
  const project = await Project.findByPk(projectId as string);
  if (!project) {
    throw new createHttpError.NotFound("project-not-found");
  }

  const cityLimitChanged =
    validatedData.cityCountLimit !== undefined &&
    validatedData.cityCountLimit !== project.cityCountLimit;

  await project.update(validatedData);

  if (cityLimitChanged) {
    const organization = await db.models.Organization.findByPk(
      project.organizationId,
    );
    const admins = await db.models.OrganizationAdmin.findAll({
      where: { organizationId: project.organizationId },
      include: { model: db.models.User, as: "user" },
    });

    const users = admins.map((admin) => admin?.user).filter((user) => user);
    await EmailService.sendCitySlotUpdateNotificationEmail({
      project,
      organizationName: organization?.name as string,
      users,
    });
  }
  return NextResponse.json(project);
});

// delete a project
export const DELETE = apiHandler(async (req, { params, session }) => {
  UserService.validateIsAdmin(session);
  const { project: projectId } = params;
  if (projectId === DEFAULT_PROJECT_ID) {
    throw new createHttpError.BadRequest("Cannot delete default project");
  }
  const project = await Project.findByPk(projectId as string);
  if (!project) {
    throw new createHttpError.NotFound("project-not-found");
  }

  const organization = await db.models.Organization.findByPk(
    project.organizationId,
  );
  const admins = await db.models.OrganizationAdmin.findAll({
    where: { organizationId: project.organizationId },
    include: { model: db.models.User, as: "user" },
  });

  // delete all the cities belonging to the project
  // Step 1: Delete all cities associated with this project
  await City.destroy({
    where: {
      projectId: projectId as string,
    },
  });

  await project.destroy();

  const users = admins.map((admin) => admin?.user).filter((user) => user);
  await EmailService.sendProjectDeletionNotificationEmail({
    project,
    organizationName: organization?.name as string,
    users,
  });

  return NextResponse.json({ deleted: true });
});
