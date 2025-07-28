import { db } from "@/models";
import { apiHandler } from "@/util/api";
import { NextResponse } from "next/server";

export const GET = apiHandler(async (_req: Request, context) => {
  const projectId = context.params.project;
  const projectModules = await db.models.ProjectModules.findAll({
    where: { project_id: projectId },
    include: [{ model: db.models.Module, as: "module" }],
  });
  const modules = projectModules.map((pm: any) => pm.module);
  return NextResponse.json({ data: modules });
});
