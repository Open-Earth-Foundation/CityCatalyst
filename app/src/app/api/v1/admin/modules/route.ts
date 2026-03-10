import { apiHandler } from "@/util/api";
import UserService from "@/backend/UserService";
import { db } from "@/models";
import { NextResponse } from "next/server";
import { translateModuleFields } from "@/util/translate";

export const GET = apiHandler(async (_req, { session }) => {
  UserService.validateIsAdmin(session);

  const modules = await db.models.Module.findAll();

  return NextResponse.json({ data: modules });
});

export const POST = apiHandler(async (req, { session }) => {
  UserService.validateIsAdmin(session);

  const body = await req.json();
  const { name, description, tagline, stage, url, logo, author, status } = body;

  const translated = await translateModuleFields({
    name,
    description: description || "",
    tagline: tagline || "",
  });

  const record = await db.models.Module.create({
    name: translated.name,
    description: translated.description,
    tagline: translated.tagline,
    stage,
    type: "POC",
    status: status || "poc",
    author: author || "Open Earth Foundation",
    url,
    logo: logo || "",
  });

  return NextResponse.json({ data: record }, { status: 201 });
});
