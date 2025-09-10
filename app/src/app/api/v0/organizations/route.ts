/**
 * @swagger
 * /api/v0/organizations:
 *   get:
 *     tags:
 *       - Organizations
 *     summary: List organizations
 *     responses:
 *       200:
 *         description: Organizations returned.
 *   post:
 *     tags:
 *       - Organizations
 *     summary: Create an organization
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, contactEmail]
 *             properties:
 *               name:
 *                 type: string
 *               contactEmail:
 *                 type: string
 *                 format: email
 *     responses:
 *       201:
 *         description: Organization created.
 */
import { Organization } from "@/models/Organization";
import { randomUUID } from "node:crypto";
import { createOrganizationRequest } from "@/util/validation";
import { NextResponse } from "next/server";
import UserService from "@/backend/UserService";
import { apiHandler } from "@/util/api";
import { db } from "@/models";

export const POST = apiHandler(async (req, { params, session }) => {
  UserService.validateIsAdmin(session);
  const orgData = createOrganizationRequest.parse(await req.json());
  const newOrg = await Organization.create({
    organizationId: randomUUID(),
    active: true,
    ...orgData,
  });
  return NextResponse.json(newOrg, { status: 201 });
});

export const GET = apiHandler(async (_req, { params, session }) => {
  UserService.validateIsAdmin(session);

  const organizations = await Organization.findAll({
    include: [
      {
        model: db.models.OrganizationInvite,
        as: "organizationInvite",
        attributes: ["status", "email", "role"],
        where: { role: "org_admin" },
        required: false,
      },
      {
        model: db.models.Project,
        as: "projects",
        attributes: ["projectId", "name", "cityCountLimit"],
      },
    ],
    order: [["created", "ASC"]],
  });

  return NextResponse.json(organizations, { status: 200 });
});
