/**
 * @swagger
 * /api/v0/admin/update-inventories:
 *   post:
 *     tags:
 *       - Admin
 *     summary: Update inventories’ population context for many cities/years.
 *     description: Regenerates population and location context for inventories that match the provided cities and years, and optionally reassigns them to a project. Requires an admin session; non-admins receive an authorization error. Use this to refresh inventory context data in bulk.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [userEmail, cityLocodes, years, projectId]
 *             properties:
 *               userEmail:
 *                 type: string
 *                 format: email
 *               cityLocodes:
 *                 type: array
 *                 items:
 *                   type: string
 *               years:
 *                 type: array
 *                 items:
 *                   type: integer
 *               projectId:
 *                 type: string
 *                 format: uuid
 *     responses:
 *       200:
 *         description: Array of errors (empty if all updates succeeded).
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   locode:
 *                     type: string
 *                   error:
 *                     type: string
 *             examples:
 *               example:
 *                 value:
 *                   - locode: "US-DDD"
 *                     error: "Population data incomplete for city US-DDD and inventory year 2021"
 *       400:
 *         description: Request validation failed.
 *       404:
 *         description: City or inventory not found.
 */
import AdminService from "@/backend/AdminService";
import { apiHandler } from "@/util/api";
import { NextResponse } from "next/server";
import { z } from "zod";

const updateInventoriesRequest = z.object({
  userEmail: z.string().email(), // Email of the user whose inventories are to be updated
  cityLocodes: z.array(z.string()).max(100), // List of city locodes
  years: z.array(z.number().int().positive()).max(10), // List of years to update inventories for
  projectId: z.string().uuid(), // Project ID to which the inventories should be assigned
});

export const POST = apiHandler(async (req, { session }) => {
  const props = updateInventoriesRequest.parse(await req.json());
  const result = await AdminService.bulkUpdateInventories(props, session);
  return NextResponse.json(result);
});
