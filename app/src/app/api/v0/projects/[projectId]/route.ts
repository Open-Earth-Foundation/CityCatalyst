import { apiHandler } from "@/util/api";
import UserService from "@/backend/UserService";
import { Project } from "@/models/Project";
import createHttpError from "http-errors";
import { NextResponse } from "next/server";
import { updateProjectRequest } from "@/util/validation";

export const GET = apiHandler(async (req, { params, session }) => {
  // return a single project.
  UserService.validateIsOefAdmin(session);
  const { projectId } = params;
  const project = await Project.findByPk(projectId as string);
  if (!project) {
    throw new createHttpError.NotFound("project-not-found");
  }
  return NextResponse.json(project);
});

// update a project
export const PATCH = apiHandler(async (req, { params, session }) => {
  UserService.validateIsOefAdmin(session);
  const { projectId } = params;
  const validatedData = updateProjectRequest.parse(await req.json());
  const project = await Project.findByPk(projectId as string);
  if (!project) {
    throw new createHttpError.NotFound("project-not-found");
  } else {
    await project.update(validatedData);
    return NextResponse.json(project);
  }
});

// delete a project
export const DELETE = apiHandler(async (req, { params, session }) => {
  UserService.validateIsOefAdmin(session);
  const { projectId } = params;
  const project = await Project.findByPk(projectId as string);
  if (!project) {
    throw new createHttpError.NotFound("project-not-found");
  }
  await project.destroy();
  return NextResponse.json({ deleted: true });
});
