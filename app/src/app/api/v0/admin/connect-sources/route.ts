/**
 * @swagger
 * /api/v0/admin/connect-sources:
 *   post:
 *     tags:
 *       - Admin
 *     summary: Connect bulk data sources (admin)
 *     description: Connects data sources for inventories identified by user email, cities, and years. Admin only.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [userEmail, cityLocodes, years]
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
 *     responses:
 *       200:
 *         description: Data sources connected.
 */
import AdminService from "@/backend/AdminService";
import { apiHandler } from "@/util/api";
import { NextResponse } from "next/server";
import { z } from "zod";

const connectBulkSourcesRequest = z.object({
  userEmail: z.string().email(), // Email of the user whose invnetories are to be connected
  cityLocodes: z.array(z.string()).max(100), // List of city locodes
  years: z.array(z.number().int().positive()).max(10), // List of years to create inventories for (can be comma separated input, multiple select dropdown etc., so multiple years can be chosen)
});

export const POST = apiHandler(async (req, { session }) => {
  const props = connectBulkSourcesRequest.parse(await req.json());
  const result = await AdminService.bulkConnectDataSources(props, session);
  return NextResponse.json(result);
});
