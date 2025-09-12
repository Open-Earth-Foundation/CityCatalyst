/**
 * @swagger
 * /api/v0/admin/all-cities:
 *   get:
 *     tags:
 *       - Admin
 *     summary: List all cities with project and organization context.
 *     description: Returns all cities in the system including basic project and organization fields. Requires an admin session to succeed; non-admin users receive an authorization error. Use this to audit cities and their parent project/organization mapping.
 *     responses:
 *       200:
 *         description: List of cities wrapped in a data object.
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
 *                       project:
 *                         type: object
 *                         properties:
 *                           organizationId:
 *                             type: string
 *                             format: uuid
 *                           name:
 *                             type: string
 *                           cityCountLimit:
 *                             type: integer
 *                           organization:
 *                             type: object
 *                             properties:
 *                               organizationId:
 *                                 type: string
 *                                 format: uuid
 *                               name:
 *                                 type: string
 *                               contactEmail:
 *                                 type: string
 *                                 format: email
 *                     additionalProperties: true
 *             examples:
 *               example:
 *                 value:
 *                   data:
 *                     - cityId: "c9d8a3c2-1234-4c1a-9de1-6f3f25a2b111"
 *                       name: "Sample City"
 *                       locode: "US-XXX"
 *                       project:
 *                         organizationId: "b1c2d3e4-5678-4f90-aaaa-bbbbccccdddd"
 *                         name: "Project Alpha"
 *                         cityCountLimit: 25
 *                         organization:
 *                           organizationId: "0b6b1f1e-2222-4c33-9999-eeeeffff0000"
 *                           name: "Org Name"
 *                           contactEmail: "admin@example.org"
 *       401:
 *         description: Unauthorized.
 */
import { apiHandler } from "@/util/api";
import UserService from "@/backend/UserService";
import { db } from "@/models";
import { NextResponse } from "next/server";

export const GET = apiHandler(async (_req, { session }) => {
  UserService.validateIsAdmin(session);

  const cities = await db.models.City.findAll({
    include: [
      {
        model: db.models.Project,
        as: "project",
        attributes: ["organizationId", "name", "cityCountLimit"],
        include: [
          {
            model: db.models.Organization,
            as: "organization",
            attributes: ["organizationId", "name", "contactEmail"],
          },
        ],
      },
    ],
  });

  return NextResponse.json({ data: cities });
});
