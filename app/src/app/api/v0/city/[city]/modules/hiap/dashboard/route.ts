import { PermissionHelpers, CityWithProject } from "@/backend/permissions";
import { ModuleDashboardService } from "@/backend/ModuleDashboardService";
import { apiHandler } from "@/util/api";
import { NextResponse } from "next/server";
import { z } from "zod";

const paramsSchema = z.object({
  city: z.string().uuid("City ID must be a valid UUID"),
});

export const GET = apiHandler(async (req: Request, context) => {
  const { city: cityId } = paramsSchema.parse(context.params);
  const { session } = context;

  // Use PermissionHelpers to verify access and get city with proper typing
  const city: CityWithProject = await PermissionHelpers.getAuthorizedCity(
    session,
    cityId,
  );

  const searchParams = new URL(req.url).searchParams;
  const lng = searchParams.get("lng") || "en";

  // Get HIAP dashboard data
  const hiapData = await ModuleDashboardService.getHIAPDashboardData(
    cityId,
    lng,
  );

  return NextResponse.json({
    data: hiapData,
    metadata: {
      cityId,
      cityName: city.name,
      projectId: city.project.projectId,
      moduleId: "hiap",
    },
  });
});