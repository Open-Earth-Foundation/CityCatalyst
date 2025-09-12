/**
 * @swagger
 * /api/v0/organizations:
 *   get:
 *     tags:
 *       - Organizations
 *     summary: List organizations with projects and pending admin invites (admin only).
 *     description: Returns all organizations including selected project fields and pending org_admin invites. Requires an admin session; non‑admins receive 401/403 via middleware handlers. Response is a JSON array (not wrapped).
 *     responses:
 *       200:
 *         description: Array of organizations.
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items: { type: object, additionalProperties: true }
 *   post:
 *     tags:
 *       - Organizations
 *     summary: Create a new organization (admin only).
 *     description: Creates an active organization with name and contactEmail. Requires an admin session. Response is the created organization object (not wrapped).
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
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               additionalProperties: true
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
