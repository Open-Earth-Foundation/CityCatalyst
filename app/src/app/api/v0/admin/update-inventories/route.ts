/**
 * @swagger
 * /api/v0/admin/update-inventories:
 *   post:
 *     tags:
 *       - Admin
 *     summary: Bulk update inventories (admin)
 *     description: Updates inventories for a user's cities and years, and assigns to a project. Admin only.
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
 *         description: Inventories updated.
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
