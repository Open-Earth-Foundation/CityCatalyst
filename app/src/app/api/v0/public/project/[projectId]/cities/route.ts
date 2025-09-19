import { NextResponse } from "next/server";
import { apiHandler } from "@/util/api";
import createHttpError from "http-errors";
import { validate } from "uuid";
import { db } from "@/models";

/**
 * @swagger
 * /api/v0/public/project/{projectId}/cities:
 *   get:
 *     tags:
 *       - Public
 *     summary: Get all public cities within a project by project ID.
 *     description: Public endpoint that returns all cities within a project that have at least one public inventory. No authentication is required. Response is wrapped in { data } and includes basic city information.
 *     parameters:
 *       - in: path
 *         name: projectId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: The project ID to fetch public cities for
 *     responses:
 *       200:
 *         description: List of public cities in the project wrapped in data.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       cityId:
 *                         type: string
 *                         format: uuid
 *                       name:
 *                         type: string
 *                       locode:
 *                         type: string
 *                       country:
 *                         type: string
 *                       region:
 *                         type: string
 *                       area:
 *                         type: number
 *             examples:
 *               example:
 *                 value:
 *                   data:
 *                     - cityId: "11111111-1111-1111-1111-111111111111"
 *                       name: "Sample City"
 *                       locode: "US-XXX"
 *                       country: "United States"
 *                       region: "California"
 *                       area: 500000
 *                     - cityId: "22222222-2222-2222-2222-222222222222"
 *                       name: "Another City"
 *                       locode: "US-YYY"
 *                       country: "United States"
 *                       region: "Texas"
 *                       area: 750000
 *       400:
 *         description: Invalid project ID.
 *       404:
 *         description: Project not found or no public cities available.
 */

export const GET = apiHandler(async (req, { params }) => {
  const { projectId } = params;

  if (!validate(projectId)) {
    throw new createHttpError.BadRequest(
      `'${projectId}' is not a valid project id (uuid)`,
    );
  }

  // Verify project exists
  const project = await db.models.Project.findByPk(projectId);
  if (!project) {
    throw new createHttpError.NotFound("Project not found");
  }

  // Get all cities in the project that have at least one public inventory
  const publicCities = await db.models.City.findAll({
    where: {
      projectId: projectId,
    },
    include: [
      {
        model: db.models.Inventory,
        as: "inventories",
        where: {
          isPublic: true,
        },
        required: true, // This ensures only cities with public inventories are returned
        attributes: [], // We don't need inventory details, just checking existence
      },
    ],
    attributes: ["cityId", "name", "locode", "country", "region", "area"],
  });

  if (publicCities.length === 0) {
    throw new createHttpError.NotFound(
      "No public cities found in this project",
    );
  }

  return NextResponse.json({ data: publicCities });
});
