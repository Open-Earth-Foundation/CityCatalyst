/**
 * @swagger
 * /api/v1/user/permissions:
 *   get:
 *     tags:
 *       - User
 *     summary: Check user's access for a resource context
 *     parameters:
 *       - in: query
 *         name: organizationId
 *         required: false
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: query
 *         name: projectId
 *         required: false
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: query
 *         name: cityId
 *         required: false
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: query
 *         name: inventoryId
 *         required: false
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Access status returned for provided context.
 *       400:
 *         description: No resource ID provided.
 *       401:
 *         description: Authentication required.
 */
import { apiHandler } from "@/util/api";
import { NextResponse } from "next/server";
import { PermissionService } from "@/backend/permissions/PermissionService";
import { UserRole } from "@/util/types";
import { z } from "zod";
import createHttpError from "http-errors";

const permissionCheckSchema = z.object({
  organizationId: z.string().uuid().optional(),
  projectId: z.string().uuid().optional(),
  cityId: z.string().uuid().optional(),
  inventoryId: z.string().uuid().optional(),
});

export const GET = apiHandler(async (req, { session }) => {
  if (!session?.user) {
    throw new createHttpError.Unauthorized("Authentication required");
  }

  const searchParams = Object.fromEntries(req.nextUrl.searchParams.entries());
  const params = permissionCheckSchema.parse(searchParams);

  // Determine the most specific context provided
  const context = params.inventoryId
    ? { inventoryId: params.inventoryId }
    : params.cityId
      ? { cityId: params.cityId }
      : params.projectId
        ? { projectId: params.projectId }
        : params.organizationId
          ? { organizationId: params.organizationId }
          : null;

  if (!context) {
    throw new createHttpError.BadRequest(
      "At least one resource ID must be provided",
    );
  }

  try {
    // Use PermissionService to get user's role in this context
    const access = await PermissionService.checkAccess(session, context);

    return NextResponse.json({
      data: {
        hasAccess: access.hasAccess,
        userRole: access.userRole,
        organizationId: access.organizationId,
        context: context,
      },
    });
  } catch (error) {
    // User doesn't have access to this resource
    return NextResponse.json({
      data: {
        hasAccess: false,
        userRole: UserRole.NO_ACCESS,
        organizationId: null,
        context: context,
      },
    });
  }
});
