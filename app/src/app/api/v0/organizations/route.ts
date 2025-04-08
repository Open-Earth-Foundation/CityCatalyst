import { Organization } from "@/models/Organization";
import { randomUUID } from "node:crypto";
import { createOrganizationRequest } from "@/util/validation";
import { NextResponse } from "next/server";
import UserService from "@/backend/UserService";
import { apiHandler } from "@/util/api";
import { OrganizationInvite } from "@/models/OrganizationInvite";
import { db } from "@/models";

export const POST = apiHandler(async (req, { params, session }) => {
  UserService.validateIsAdmin(session);
  const orgData = createOrganizationRequest.parse(await req.json());
  const newOrg = await Organization.create({
    organizationId: randomUUID(),
    ...orgData,
  });
  return NextResponse.json(newOrg, { status: 201 });
});

export const GET = apiHandler(async (_req, { params, session }) => {
  UserService.validateIsAdmin(session);

  const organizations = await Organization.findAll({
    include: [
      {
        model: db.models.OrganizationInvite,
        as: "organizationInvite",
        attributes: ["status", "email", "role"],
        where: { role: "org_admin" },
        required: false,
      },
      {
        model: db.models.Project,
        as: "projects",
        attributes: ["projectId", "name", "cityCountLimit"],
      },
    ],
  });

  return NextResponse.json(organizations, { status: 200 });
});
