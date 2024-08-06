import { apiHandler } from "@/util/api";
import { setupOpenAI } from "@/util/openai";
import { NextResponse } from "next/server";

export const GET = apiHandler(async (req, { params }) => {
  const openai = setupOpenAI();
  const file = await openai.files.retrieve(params.fileId);

  return NextResponse.json({ file: file });
});
