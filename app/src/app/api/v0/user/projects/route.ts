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
