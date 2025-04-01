import { apiHandler } from "@/util/api";
import UserService from "@/backend/UserService";
import { Project } from "@/models/Project";
import createHttpError from "http-errors";
import { NextResponse } from "next/server";

export const GET = apiHandler(async (req, { params, session }) => {
  UserService.validateIsAdmin(session);
  const { projectId } = params;
  const project = await Project.findByPk(projectId as string);
  if (!project) {
    throw new createHttpError.NotFound("project-not-found");
  }

  // Fetch users associated with the project
  const users = await UserService.findUsersInProject(projectId as string);

  return NextResponse.json(users);
});

// --- NEW DELETE Handler ---
export const DELETE = apiHandler(async (req, { params, session }) => {
  UserService.validateIsAdmin(session);

  // 2. Get Path Parameter (projectId)
  const { projectId } = params;

  // 3. Get Query Parameter (email) from the URL
  const email = req.nextUrl.searchParams.get("email");

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
