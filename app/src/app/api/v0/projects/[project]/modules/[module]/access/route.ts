import { ModuleAccessService } from "@/backend/ModuleAccessService";
import { apiHandler } from "@/util/api";
import { NextResponse } from "next/server";

export const GET = apiHandler(async (_req: Request, context) => {
  const { project: projectId, module: moduleId } = context.params;

  const hasAccess = await ModuleAccessService.hasModuleAccess(
    projectId,
    moduleId,
  );

  return NextResponse.json({
    data: hasAccess,
  });
});
