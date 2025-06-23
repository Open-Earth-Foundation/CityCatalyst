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
  UserService.validateIsAdmin(session);

  // 2. Get Path Parameter (projectId)
  const { project: projectId } = params;

  // 3. Get Query Parameter (email) from the URL and properly decode it
  const url = new URL(req.url);
  const emailParam = url.searchParams.get("email");
  // The searchParams.get() already decodes, but converts + to space
  // We need to manually decode to preserve the + character
  const email = emailParam ? emailParam.replace(/ /g, "+") : null;

  const project = await Project.findByPk(projectId as string);
  if (!project) {
    throw new createHttpError.NotFound("project-not-found");
  }

  if (!email) {
    throw new createHttpError.BadRequest("user-not-found");
  }
  await UserService.removeUserFromProject(projectId as string, email);

  return NextResponse.json(null);
});
