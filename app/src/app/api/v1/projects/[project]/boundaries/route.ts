/**
 * @swagger
 * /api/v1/projects/{project}/boundaries:
 *   get:
 *     tags:
 *       - projects
 *     operationId: getProjectBoundaries
 *     summary: Get boundary center points and latest inventory IDs for a project’s cities.
 *     description: "Returns boundary info for each city (with center coordinates) plus the latest inventory ID per city, aggregating any errors for missing data. Requires org/project admin access. Response is '{' result: CityBoundaryWithCity[], errors: {locode,error}[] '}'."
 *     parameters:
 *       - in: path
 *         name: project
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Boundary data and errors per city.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 result:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       boundingBox:
 *                         type: array
 *                         items:
 *                           type: number
 *                       city:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: string
 *                             format: uuid
 *                           name:
 *                             type: string
 *                           locode:
 *                             type: string
 *                           latestInventoryId:
 *                             type: string
 *                             format: uuid
 *                 errors:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       locode:
 *                         type: string
 *                       error:
 *                         type: string
 *       404:
 *         description: Project not found.
 */
import { apiHandler } from "@/util/api";
import { NextResponse } from "next/server";
import { PermissionService } from "@/backend/permissions/PermissionService";
import { PublicProjectService } from "@/backend/PublicProjectService";

// TODO cache the results of this route
export const GET = apiHandler(async (req, { params, session }) => {
  const { project: projectId } = params;
  await PermissionService.canAccessProject(session, projectId);

  const boundaries = await PublicProjectService.getBoundaries(projectId);

  return NextResponse.json(boundaries);
});
