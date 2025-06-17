import { apiHandler } from "@/util/api";
import UserService from "@/backend/UserService";
import createHttpError from "http-errors";
import { NextResponse } from "next/server";

export const DELETE = apiHandler(async (req, { params, session }) => {
  UserService.validateIsAdmin(session);
  const { organization: organizationId } = params;

  // Get Query Parameter (email) from the URL
  const email = req.nextUrl.searchParams.get("email");
  if (!email) {
    throw new createHttpError.BadRequest("user-not-found");
  }

  // Remove user from organization
  await UserService.removeOrganizationOwner(organizationId, email);
  return NextResponse.json(null);
});
