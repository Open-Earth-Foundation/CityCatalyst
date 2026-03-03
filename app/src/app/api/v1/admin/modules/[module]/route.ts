import { apiHandler } from "@/util/api";
import UserService from "@/backend/UserService";
import { db } from "@/models";
import { NextResponse } from "next/server";
import createHttpError from "http-errors";
import { translateModuleFields } from "@/util/translate";

export const PUT = apiHandler(async (req, { session, params }) => {
  UserService.validateIsAdmin(session);

  const moduleId = params.module;
  const record = await db.models.Module.findByPk(moduleId);

  if (!record) {
    throw createHttpError(404, "Module not found");
  }

  if (record.type !== "POC") {
    throw createHttpError(403, "Only POC modules can be edited");
  }

  const body = await req.json();
  const { name, description, tagline, stage, url, logo, status } = body;

  const updateData: Record<string, unknown> = {};

  const nameChanged = name !== undefined && name !== (record.name?.en ?? "");
  const descChanged = description !== undefined && description !== (record.description?.en ?? "");
  const taglineChanged = tagline !== undefined && tagline !== (record.tagline?.en ?? "");

  if (nameChanged || descChanged || taglineChanged) {
    const translated = await translateModuleFields({
      name: nameChanged ? name : "",
      description: descChanged ? description : "",
      tagline: taglineChanged ? tagline : "",
    });

    if (nameChanged) updateData.name = translated.name;
    if (descChanged) updateData.description = translated.description;
    if (taglineChanged) updateData.tagline = translated.tagline;
  }

  if (stage !== undefined) updateData.stage = stage;
  if (status !== undefined) updateData.status = status;
  if (url !== undefined) updateData.url = url;
  if (logo !== undefined) updateData.logo = logo;

  await record.update(updateData);

  return NextResponse.json({ data: record });
});

export const DELETE = apiHandler(async (_req, { session, params }) => {
  UserService.validateIsAdmin(session);

  const moduleId = params.module;
  const record = await db.models.Module.findByPk(moduleId);

  if (!record) {
    throw createHttpError(404, "Module not found");
  }

  if (record.type !== "POC") {
    throw createHttpError(403, "Only POC modules can be deleted");
  }

  await db.models.ProjectModules.destroy({ where: { moduleId } });
  await record.destroy();

  return NextResponse.json({ message: "Module deleted successfully" });
});
