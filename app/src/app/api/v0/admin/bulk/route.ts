/**
 * @swagger
 * /api/v0/admin/bulk:
 *   post:
 *     tags:
 *       - Admin
 *     summary: Create inventories in bulk for multiple cities and years.
 *     description: Creates city records (if needed) and inventories for each provided LOCODE and year, and adds the specified users to those cities. Requires an admin session; non-admins receive an authorization error. Use this to seed projects quickly across many locations.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [cityLocodes, emails, years, scope, gwp, projectId]
 *             properties:
 *               cityLocodes:
 *                 type: array
 *                 items:
 *                   type: string
 *               emails:
 *                 type: array
 *                 items:
 *                   type: string
 *                   format: email
 *               years:
 *                 type: array
 *                 items:
 *                   type: integer
 *               scope:
 *                 type: string
 *                 enum: [gpc_basic, gpc_basic_plus]
 *               gwp:
 *                 type: string
 *                 enum: [AR5, AR6]
 *               projectId:
 *                 type: string
 *                 format: uuid
 *     responses:
 *       200:
 *         description: Operation result with created inventory IDs and any errors.
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
 *                         oneOf:
 *                           - type: string
 *                           - type: object
 *                             additionalProperties: true
 *                 results:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       locode:
 *                         type: string
 *                       result:
 *                         type: array
 *                         items:
 *                           type: string
 *                           format: uuid
 *             examples:
 *               example:
 *                 value:
 *                   errors:
 *                     - locode: "US-AAA"
 *                       error: "Population data incomplete for city US-AAA and inventory year 2022"
 *                   results:
 *                     - locode: "US-BBB"
 *                       result:
 *                         - "a1111111-1111-1111-1111-111111111111"
 *                         - "b2222222-2222-2222-2222-222222222222"
 *       400:
 *         description: Invalid request or users not found for invitation.
 *       404:
 *         description: City name lookup failed or related entity missing.
 */
import AdminService from "@/backend/AdminService";
import { apiHandler } from "@/util/api";
import { NextResponse } from "next/server";
import { z } from "zod";

const createBulkInventoriesRequest = z.object({
  cityLocodes: z.array(z.string()), // List of city locodes
  emails: z.array(z.string().email()), // Comma separated list of emails to invite to the all of the created inventories
  years: z.array(z.number().int().positive()), // List of years to create inventories for
  scope: z.enum(["gpc_basic", "gpc_basic_plus"]), // Scope selection (gpc_basic or gpc_basic_plus)
  gwp: z.enum(["AR5", "AR6"]), // GWP selection (AR5 or AR6)
  projectId: z.string().uuid(), // project to which the inventories should be assigned
});

export const POST = apiHandler(async (req, { session }) => {
  const props = createBulkInventoriesRequest.parse(await req.json());
  const result = await AdminService.createBulkInventories(props, session);
  return NextResponse.json(result);
});
