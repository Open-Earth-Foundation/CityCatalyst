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

/**
 * GET /api/v0/user/permissions
 * 
 * Query params:
 * - organizationId?: string (UUID)
 * - projectId?: string (UUID)  
 * - cityId?: string (UUID)
 * - inventoryId?: string (UUID)
 * 
 * Returns user's role and access level for the given resource context
 */
export const GET = apiHandler(async (req, { session }) => {
  if (!session?.user) {
    throw new createHttpError.Unauthorized("Authentication required");
  }

  const searchParams = Object.fromEntries(req.nextUrl.searchParams.entries());
  const params = permissionCheckSchema.parse(searchParams);

  // Determine the most specific context provided
  const context = params.inventoryId ? { inventoryId: params.inventoryId }
    : params.cityId ? { cityId: params.cityId }
    : params.projectId ? { projectId: params.projectId }
    : params.organizationId ? { organizationId: params.organizationId }
    : null;

  if (!context) {
    throw new createHttpError.BadRequest("At least one resource ID must be provided");
  }

  try {
    // Use PermissionService to get user's role in this context
    const access = await PermissionService.checkAccess(session, context);
    
    return NextResponse.json({
      data: {
        hasAccess: access.hasAccess,
        userRole: access.userRole,
        organizationId: access.organizationId,
        context: context
      }
    });
  } catch (error) {
    // User doesn't have access to this resource
    return NextResponse.json({
      data: {
        hasAccess: false,
        userRole: UserRole.NO_ACCESS,
        organizationId: null,
        context: context
      }
    });
  }
});