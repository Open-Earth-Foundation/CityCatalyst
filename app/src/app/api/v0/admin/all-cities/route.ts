/**
 * @swagger
 * /api/v0/admin/all-cities:
 *   get:
 *     tags:
 *       - Admin
 *     summary: List all cities (admin)
 *     description: Returns all cities with their project and organization details. Admin only.
 *     responses:
 *       200:
 *         description: Cities returned.
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
