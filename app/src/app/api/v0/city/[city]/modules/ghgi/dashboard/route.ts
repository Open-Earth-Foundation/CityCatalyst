import { PermissionHelpers, CityWithProject } from "@/backend/permissions";
import { ModuleDashboardService } from "@/backend/ModuleDashboardService";
import { apiHandler } from "@/util/api";
import { NextResponse } from "next/server";
import { z } from "zod";
import { Modules } from "@/util/constants";

const paramsSchema = z.object({
  city: z.string().uuid("City ID must be a valid UUID"),
});

export const GET = apiHandler(async (_req: Request, context) => {
  const { city: cityId } = paramsSchema.parse(context.params);
  const { session } = context;

  // Use PermissionHelpers to verify access and get city with proper typing
  const city: CityWithProject = await PermissionHelpers.getAuthorizedCity(
    session,
    cityId,
  );

  // Get GHGI dashboard data (module access check is now handled inside the service)
  const ghgiData = await ModuleDashboardService.getGHGIDashboardData(
    cityId,
    city.project.projectId,
  );

  return NextResponse.json({
    data: ghgiData,
    metadata: {
      cityId,
      cityName: city.name,
      projectId: city.project.projectId,
      moduleId: Modules.GHGI.id,
    },
  });
});