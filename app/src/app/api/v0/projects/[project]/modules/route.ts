import { db } from "@/models";
import { apiHandler } from "@/util/api";
import { NextResponse } from "next/server";
import { z } from "zod";

const paramsSchema = z.object({
  project: z.string().uuid("Project ID must be a valid UUID"),
});

export const GET = apiHandler(async (_req: Request, context) => {
  const { project: projectId } = paramsSchema.parse(context.params);
  console.log(projectId);
  const projectModules = await db.models.ProjectModules.findAll({
    where: { projectId: projectId },
    include: [{ model: db.models.Module, as: "module" }],
  });
  const modules = projectModules.map((pm: any) => pm.module);
  return NextResponse.json({ data: modules });
});
