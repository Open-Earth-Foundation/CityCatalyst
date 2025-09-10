/**
 * @swagger
 * /api/v0/projects/{project}/users:
 *   get:
 *     tags:
 *       - Projects
 *     summary: List users in a project
 *     parameters:
 *       - in: path
 *         name: project
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Users returned.
 *       404:
 *         description: Project not found.
 *   delete:
 *     tags:
 *       - Projects
 *     summary: Remove a user from a project
 *     parameters:
 *       - in: path
 *         name: project
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: query
 *         name: email
 *         required: true
 *         schema:
 *           type: string
 *           format: email
 *     responses:
 *       200:
 *         description: User removed.
 *       400:
 *         description: user-not-found query param missing.
 *       404:
 *         description: Project not found.
 */
import { apiHandler } from "@/util/api";
import UserService from "@/backend/UserService";
import { Project } from "@/models/Project";
import createHttpError from "http-errors";
import { NextResponse } from "next/server";

export const GET = apiHandler(async (req, { params, session }) => {
  const { project: projectId } = params;
  const project = await Project.findByPk(projectId as string);
  if (!project) {
    throw new createHttpError.NotFound("project-not-found");
  }

  UserService.validateIsAdminOrOrgAdmin(session, project?.organizationId);

  // Fetch users associated with the project
  const users = await UserService.findUsersInProject(projectId as string);

  return NextResponse.json(users);
});

// --- NEW DELETE Handler ---
export const DELETE = apiHandler(async (req, { params, session }) => {
  // 2. Get Path Parameter (projectId)
  const { project: projectId } = params;

  // 3. Get Query Parameter (email) from the URL
  const url = new URL(req.url);
  const email = url.searchParams.get("email");

  const project = await Project.findByPk(projectId as string);
  if (!project) {
    throw new createHttpError.NotFound("project-not-found");
  }

  UserService.validateIsAdminOrOrgAdmin(session, project.organizationId);

  if (!email) {
    throw new createHttpError.BadRequest("user-not-found");
  }
  await UserService.removeUserFromProject(projectId as string, email);

  return NextResponse.json(null);
});
