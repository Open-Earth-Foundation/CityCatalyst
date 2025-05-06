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
                attributes: ["logoUrl", "themeId", "organizationId", "name"],
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
    theme: {
      themeId: theme?.themeId,
      themeKey: theme?.themeKey,
    },
  };

  return NextResponse.json(response);
});
