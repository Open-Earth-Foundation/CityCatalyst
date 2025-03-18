import { Organization } from "@/models/Organization";
import { randomUUID } from "node:crypto";
import { createOrganizationRequest } from "@/util/validation";
import { NextResponse } from "next/server";
import UserService from "@/backend/UserService";
import { apiHandler } from "@/util/api";

export const POST = apiHandler(async (req, { params, session }) => {
  console.log(session, "session data");
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
  const organizations = await Organization.findAll(); // join the organization invite table searching for the invite status of the org owner
  return NextResponse.json(organizations);
});
