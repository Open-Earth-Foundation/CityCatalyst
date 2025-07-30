import { ModuleAccessService } from "@/backend/ModuleAccessService";
import { db } from "@/models";
import { apiHandler } from "@/util/api";
import { NextResponse } from "next/server";
import createHttpError from "http-errors";

export const GET = apiHandler(async (_req: Request, context) => {
  const { city: cityId, module: moduleId } = context.params;
  
  const city = await db.models.City.findByPk(cityId, {
    include: [{ model: db.models.Project, as: "project" }],
  });
  if (!city || !city.projectId) {
    throw new createHttpError.NotFound("City not found");
  }

  if (!moduleId) {
    throw new createHttpError.BadRequest("ModuleId is missing");
  }

  const hasAccess = await ModuleAccessService.hasModuleAccess(
    city.projectId,
    moduleId,
  );
  return NextResponse.json({
    data: {
      hasAccess,
    },
  });
});
