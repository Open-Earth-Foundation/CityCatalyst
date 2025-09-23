/**
 * @swagger
 * /api/v0/user/projects:
 *   get:
 *     tags:
 *       - User
 *     summary: List projects the current user belongs to
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
