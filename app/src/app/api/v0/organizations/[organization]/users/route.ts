/**
 * @swagger
 * /api/v0/organizations/{organization}/users:
 *   delete:
 *     tags:
 *       - Organization Users
 *     summary: Remove a user from an organization
 *     parameters:
 *       - in: path
 *         name: organization
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: query
 *         name: email
 *         required: true
 *         schema:
 *           type: string
 *           format: email
 *     responses:
 *       200:
 *         description: User removed.
 *       400:
 *         description: user-not-found query param missing.
 */
import { apiHandler } from "@/util/api";
import UserService from "@/backend/UserService";
import createHttpError from "http-errors";
import { NextResponse } from "next/server";

export const DELETE = apiHandler(async (req, { params, session }) => {
  const { organization: organizationId } = params;

  UserService.validateIsAdminOrOrgAdmin(session, organizationId);

  // Get Query Parameter (email) from the URL
  const email = req.nextUrl.searchParams.get("email");
  if (!email) {
    throw new createHttpError.BadRequest("user-not-found");
  }

  // Remove user from organization
  await UserService.removeOrganizationOwner(organizationId, email);
  return NextResponse.json(null);
});
