import { db } from "@/models";
import { apiHandler } from "@/util/api";
import { NextResponse } from "next/server";

export const GET = apiHandler(async (_req: Request) => {
  const modules = await db.models.Module.findAll();
  return NextResponse.json({ data: modules });
});
