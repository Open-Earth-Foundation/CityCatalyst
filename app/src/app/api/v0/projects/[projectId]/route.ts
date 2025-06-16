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
  const { projectId } = params;
  const project = await Project.findByPk(projectId as string);
  if (!project) {
    throw new createHttpError.NotFound("project-not-found");
  }
  return NextResponse.json(project);
});

// update a project
export const PATCH = apiHandler(async (req, { params, session }) => {
  UserService.validateIsAdmin(session);
  const { projectId } = params;

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
  const { projectId } = params;
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
