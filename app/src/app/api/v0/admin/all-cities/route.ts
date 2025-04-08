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
