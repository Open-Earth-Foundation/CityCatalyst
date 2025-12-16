/**
 * @swagger
 * /api/v1/user/projects:
 *   get:
 *     tags:
 *       - user
 *     operationId: getUserProjects
 *     summary: List projects the current user belongs to
 *     description: Retrieves all projects that the current user has access to, either through direct project membership, organization admin role, or city membership. Returns project details including associated organization and city information. Requires authentication.
 *     responses:
 *       200:
 *         description: Projects returned.
 *       401:
 *         description: Unauthorized.
 */
import { apiHandler } from "@/util/api";
import createHttpError from "http-errors";
import { ProjectService } from "@/backend/ProjectsService";
import { NextResponse } from "next/server";

export const GET = apiHandler(async (req, { params, session }) => {
  if (!session) {
    throw new createHttpError.Unauthorized("Unauthorized");
  }
  const userId = session.user.id;
  // Fetch the projects associated with the user
  const projects = await ProjectService.fetchUserProjects(userId);
  return NextResponse.json(projects);
});
