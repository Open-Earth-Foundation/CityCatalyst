import { apiHandler } from "@/util/api";
import { openai } from "@/util/openai";
import { NextResponse } from "next/server";

export const POST = apiHandler(async () => {
  const thread = await openai.beta.threads.create();
  return NextResponse.json({ threadId: thread.id });
});
