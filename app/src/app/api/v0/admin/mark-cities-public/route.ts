/**
 * @swagger
 * /api/v0/admin/mark-cities-public:
 *   put:
 *     tags:
 *       - Admin
 *     summary: Mark cities as public by making their inventories public for a specific project.
 *     description: Updates all inventories for cities in a specific project to have isPublic=true, effectively making those cities public. Requires admin or OEF admin session and projectId in request body. Cities are considered public when they have at least one public inventory.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [projectId]
 *             properties:
 *               projectId:
 *                 type: string
 *                 format: uuid
 *                 description: The project ID for which to mark cities as public
 *     responses:
 *       200:
 *         description: Successfully marked cities in the project as public.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   description: Success message
 *             examples:
 *               example:
 *                 value:
 *                   message: "Successfully marked all cities in project as public"
 *       400:
 *         description: Invalid project ID or project not found.
 *       401:
 *         description: Unauthorized.
 *       403:
 *         description: Forbidden - requires admin or OEF admin permissions.
 */
import { apiHandler } from "@/util/api";
import { PermissionService } from "@/backend/permissions/PermissionService";
import { db } from "@/models";
import { NextResponse } from "next/server";
import createHttpError from "http-errors";
import { markCitiesPublicRequest } from "@/util/validation";

export const PUT = apiHandler(async (req, { session }) => {
  const body = markCitiesPublicRequest.parse(await req.json());
  const { projectId } = body;

  // Check if user has access to this project (includes OEF admin check)
  await PermissionService.canAccessProject(session, projectId);

  // Get all cities in this project
  const citiesInProject = await db.models.City.findAll({
    where: {
      projectId: projectId
    },
    attributes: ['cityId']
  });

  const cityIds = citiesInProject.map(city => city.cityId);

  if (cityIds.length === 0) {
    throw new createHttpError.NotFound("No cities found in this project");
  }

  // Update all inventories to be public for cities in this project
  // Set publishedAt to current date for inventories being made public for the first time
  await db.models.Inventory.update(
    { 
      isPublic: true,
      publishedAt: new Date()
    },
    { 
      where: {
        cityId: cityIds,
        isPublic: false // Only update inventories that aren't already public
      }
    }
  );

  return NextResponse.json({ 
    message: "Successfully marked all cities in project as public"
  });
});