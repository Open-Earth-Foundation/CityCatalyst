import { apiHandler } from "@/util/api";
import { openai } from "@/util/openai";
import { NextResponse } from "next/server";

export const GET = apiHandler(async (req, { params }) => {
  const file = await openai.files.retrieve(params.fileId);

  return NextResponse.json({ file: file });
});
