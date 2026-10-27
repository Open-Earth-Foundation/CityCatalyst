/**
 * @swagger
 * /api/v1/projects/{project}/summary:
 *   get:
 *     tags:
 *       - projects
 *     operationId: getProjectSummary
 *     summary: Get totals for cities, emissions, population, and data sources in a project.
 *     description: Computes high‑level aggregates for the project, including city count, emissions sum, total population (based on most recent inventory years per city), and total data sources. No explicit authentication is enforced in this handler currently. Response is a plain object (not wrapped).
 *     parameters:
 *       - in: path
 *         name: project
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Summary object.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 totalCities:
 *                   type: integer
 *                 totalEmissions:
 *                   type: number
 *                 totalPopulation:
 *                   type: number
 *                 totalDataSources:
 *                   type: integer
 *       404:
 *         description: Project not found.
 */
import { apiHandler } from "@/util/api";
import createHttpError from "http-errors";
import { NextResponse } from "next/server";
import { PublicProjectService } from "@/backend/PublicProjectService";

export const GET = apiHandler(async (req, { params }) => {
  const { project: projectId } = params;

  // TODO perform access control/ only show public inventories
  const summary = await PublicProjectService.getSummary(projectId);
  if (!summary) {
    throw new createHttpError.NotFound("project-not-found");
  }

  return NextResponse.json(summary);
});
