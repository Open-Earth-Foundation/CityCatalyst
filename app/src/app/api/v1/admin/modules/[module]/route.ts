import { apiHandler } from "@/util/api";
import UserService from "@/backend/UserService";
import { db } from "@/models";
import { NextResponse } from "next/server";
import createHttpError from "http-errors";
import { translateModuleFields } from "@/util/translate";

export const PUT = apiHandler(async (req, { session, params }) => {
  UserService.validateIsAdmin(session);

  const moduleId = params.module;
  const module = await db.models.Module.findByPk(moduleId);

  if (!module) {
    throw createHttpError(404, "Module not found");
  }

  if (module.type !== "POC") {
    throw createHttpError(403, "Only POC modules can be edited");
  }

  const body = await req.json();
  const { name, description, tagline, stage, url, logo } = body;

  const updateData: Record<string, unknown> = {};

  if (name !== undefined || description !== undefined || tagline !== undefined) {
    const translated = await translateModuleFields({
      name: name ?? module.name?.en ?? "",
      description: description ?? module.description?.en ?? "",
      tagline: tagline ?? module.tagline?.en ?? "",
    });

    if (name !== undefined) updateData.name = translated.name;
    if (description !== undefined) updateData.description = translated.description;
    if (tagline !== undefined) updateData.tagline = translated.tagline;
  }

  if (stage !== undefined) updateData.stage = stage;
  if (url !== undefined) updateData.url = url;
  if (logo !== undefined) updateData.logo = logo;

  await module.update(updateData);

  return NextResponse.json({ data: module });
});

export const DELETE = apiHandler(async (_req, { session, params }) => {
  UserService.validateIsAdmin(session);

  const moduleId = params.module;
  const module = await db.models.Module.findByPk(moduleId);

  if (!module) {
    throw createHttpError(404, "Module not found");
  }

  if (module.type !== "POC") {
    throw createHttpError(403, "Only POC modules can be deleted");
  }

  await db.models.ProjectModules.destroy({ where: { moduleId } });
  await module.destroy();

  return NextResponse.json({ message: "Module deleted successfully" });
});
