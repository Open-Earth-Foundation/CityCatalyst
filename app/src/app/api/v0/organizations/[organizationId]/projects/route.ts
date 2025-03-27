// creates a new project and lists all projects belonging to an organization

import { Project } from "@/models/Project";
import { createProjectRequest } from "@/util/validation";

import { apiHandler } from "@/util/api";
import { NextResponse } from "next/server";

import UserService from "@/backend/UserService";
import { randomUUID } from "node:crypto";
import { db } from "@/models";

export const POST = apiHandler(async (req, { params, session }) => {
  UserService.validateIsAdmin(session);
  const { organizationId } = params;
  const validatedData = createProjectRequest.parse(await req.json());
  const project = await Project.create({
    projectId: randomUUID(),
    ...validatedData,
    organizationId,
  });
  return NextResponse.json(project);
});

export const GET = apiHandler(async (req, { params, session }) => {
  UserService.validateIsAdmin(session);
  const { organizationId } = params;
  const projects = await Project.findAll({
    where: { organizationId },
    include: [
      {
        model: db.models.City,
        as: "cities",
        attributes: ["cityId", "name"],
      },
    ],
  });
  return NextResponse.json(projects);
});
