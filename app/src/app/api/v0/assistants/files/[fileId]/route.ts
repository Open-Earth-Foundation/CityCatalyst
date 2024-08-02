import { apiHandler } from "@/util/api";
import { openai } from "@/util/openai";
import { NextResponse } from "next/server";

export const GET = apiHandler(async (req, { params }) => {
  //const { fileId } = await req.json();
  console.log("get file!");
  console.log(params.fileId);

  const file = await openai.files.retrieve(params.fileId);
  console.log("file name: ", file.filename);

  return NextResponse.json({ file: file });
});
