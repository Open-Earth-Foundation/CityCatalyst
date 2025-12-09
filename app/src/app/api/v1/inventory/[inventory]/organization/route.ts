/**
 * @swagger
 * /api/v1/inventory/{inventory}/organization:
 *   get:
 *     tags:
 *       - Inventory Organization
 *     operationId: getInventoryInventoryOrganization
 *     summary: Get organization branding and theme information for an inventory
 *     description: Retrieves organization details including identifier, name, logo URL, active status, and theme configuration for the inventory's associated organization. Requires a signed‑in user with access to the inventory.
 *     parameters:
 *       - in: path
 *         name: inventory
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Inventory ID for which to retrieve organization information
 *     responses:
 *       200:
 *         description: Organization details with theme information.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 organizationId:
 *                   type: string
 *                   format: uuid
 *                   description: Unique identifier for the organization
 *                 organizationName:
 *                   type: string
 *                   description: Display name of the organization
 *                 logoUrl:
 *                   type: string
 *                   format: uri
 *                   nullable: true
 *                   description: URL to organization logo image
 *                 active:
 *                   type: boolean
 *                   description: Whether the organization is currently active
 *                 theme:
 *                   type: object
 *                   properties:
 *                     themeId:
 *                       type: string
 *                       format: uuid
 *                       nullable: true
 *                       description: Theme ID if a custom theme is configured
 *                     themeKey:
 *                       type: string
 *                       nullable: true
 *                       description: Theme key for styling configuration
 *                   description: Organization theme configuration
 *       401:
 *         description: Unauthorized - user lacks access to the inventory.
 *       404:
 *         description: Inventory or organization not found.
 */
import { apiHandler } from "@/util/api";
import UserService from "@/backend/UserService";
import { db } from "@/models";
import createHttpError from "http-errors";
import { NextResponse } from "next/server";

export const GET = apiHandler(async (req, { session, params }) => {
  let inventoryId = params.inventory;

  const inventory = await UserService.findUserInventory(
    inventoryId,
    session,
    [
      {
        model: db.models.City,
        as: "city",
        include: [
          {
            model: db.models.Project,
            as: "project",
            include: [
              {
                model: db.models.Organization,
                as: "organization",
                attributes: [
                  "logoUrl",
                  "themeId",
                  "organizationId",
                  "name",
                  "active",
                ],
              },
            ],
          },
        ],
      },
    ],
    true,
  );

  if (!inventory) {
    throw new createHttpError.NotFound("Inventory not found");
  }

  const organization = inventory.city?.project?.organization;

  if (!organization) {
    throw new createHttpError.NotFound("Organization not found");
  }
  let theme = null;
  if (organization.themeId) {
    theme = await db.models.Theme.findByPk(organization.themeId);
  }

  const response = {
    organizationId: organization.organizationId,
    organizationName: organization.name,
    logoUrl: organization.logoUrl,
    active: organization.active,
    theme: {
      themeId: theme?.themeId,
      themeKey: theme?.themeKey,
    },
  };

  return NextResponse.json(response);
});