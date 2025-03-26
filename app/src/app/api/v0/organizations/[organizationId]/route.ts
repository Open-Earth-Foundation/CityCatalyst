import { Organization } from "@/models/Organization";
import { updateOrganizationRequest } from "@/util/validation";
import { apiHandler } from "@/util/api";
import { NextResponse } from "next/server";
import createHttpError from "http-errors";
import UserService from "@/backend/UserService";
import { db } from "@/models";

export const GET = apiHandler(async (_req, { params, session }) => {
  UserService.validateIsAdmin(session);
  const { organizationId } = params;
  const org = await Organization.findByPk(organizationId as string, {
    include: [
      {
        model: db.models.Project,
        as: "projects",
        attributes: ["projectId", "name", "cityCountLimit"],
        include: [
          {
            model: db.models.City,
            as: "cities",
            attributes: ["cityId", "name"],
          },
        ],
      },
    ],
  });
  if (!org) {
    throw new createHttpError.NotFound("organization-not-found");
  }
  return NextResponse.json(org);
});

export const PATCH = apiHandler(async (req, { params, session }) => {
  UserService.validateIsAdmin(session);
  const { organizationId } = params;
  const validatedData = updateOrganizationRequest.parse(await req.json());
  const org = await Organization.findByPk(organizationId as string);
  if (!org) {
    throw new createHttpError.NotFound("organization-not-found");
  } else {
    const newOrg = await org.update(validatedData);
    return NextResponse.json(newOrg);
  }
});

export const DELETE = apiHandler(async (req, { params, session }) => {
  UserService.validateIsAdmin(session);
  const { organizationId } = params;
  const org = await Organization.findByPk(organizationId as string);
  if (!org) {
    throw new createHttpError.NotFound("organization-not-found");
  }
  await org.destroy();
  return NextResponse.json({ deleted: true });
});
