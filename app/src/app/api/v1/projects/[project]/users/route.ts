/**
 * @swagger
 * /api/v1/projects/{project}/users:
 *   get:
 *     tags:
 *       - Projects
 *     operationId: getProjectUsers
 *     summary: List users who belong to a project (admin only).
 *     description: Returns all users who have access to the specified project. Requires a signed‑in session with admin or organization admin privileges for the project's organization. Response is an array of user objects with their roles and join timestamps.
 *     parameters:
 *       - in: path
 *         name: project
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Project ID for which to retrieve user membership
 *     responses:
 *       200:
 *         description: Array of users with project membership information.
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   userId:
 *                     type: string
 *                     format: uuid
 *                     description: Unique identifier for the user
 *                   email:
 *                     type: string
 *                     format: email
 *                     description: User's email address
 *                   role:
 *                     type: string
 *                     enum: ['Admin', 'User', 'Viewer']
 *                     description: User's role within the project
 *                   joinedAt:
 *                     type: string
 *                     format: date-time
 *                     description: Timestamp when user joined the project
 *                 description: User object with project membership details
 *       401:
 *         description: Unauthorized - user lacks admin privileges for the project.
 *       404:
 *         description: Project not found.
 *   delete:
 *     tags:
 *       - Projects
 *     operationId: deleteProjectUsers
 *     summary: Remove a user from a project by email (admin only).
 *     description: Removes the user with the specified email address from the project membership. Requires a signed‑in session with admin or organization admin privileges for the project's organization. The user will lose access to all project resources.
 *     parameters:
 *       - in: path
 *         name: project
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Project ID from which to remove the user
 *       - in: query
 *         name: email
 *         required: true
 *         schema:
 *           type: string
 *           format: email
 *         description: Email address of the user to remove from the project
 *     responses:
 *       200:
 *         description: User successfully removed from project.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               description: Empty response body
 *       400:
 *         description: Email query parameter is missing or invalid.
 *       403:
 *         description: Access denied - user lacks admin privileges for the project.
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
