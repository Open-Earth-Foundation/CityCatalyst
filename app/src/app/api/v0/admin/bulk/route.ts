/**
 * @swagger
 * /api/v0/admin/bulk:
 *   post:
 *     tags:
 *       - Admin
 *     summary: Create bulk inventories (admin)
 *     description: Creates inventories in bulk for given city locodes and years, invites users, and assigns to a project. Admin only.
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
 *         description: Bulk inventories created.
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
