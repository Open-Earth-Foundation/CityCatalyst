/**
 * @swagger
 * /api/v0/admin/connect-sources:
 *   post:
 *     tags:
 *       - Admin
 *     summary: Connect prioritized data sources to many inventories.
 *     description: Finds inventories for the given user and cities/years and attempts to connect the best available data source per GPC reference number. Requires an admin session; non-admins receive an authorization error. Use this to auto-populate inventories with external datasets.
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
 *         description: Operation result with any connection errors.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 errors:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       locode:
 *                         type: string
 *                       error:
 *                         type: string
 *             examples:
 *               example:
 *                 value:
 *                   errors:
 *                     - locode: "US-CCC"
 *                       error: "no-data-source-available-for-gpc-reference-number"
 *       400:
 *         description: Request validation failed.
 *       404:
 *         description: Related inventory or city not found.
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
