import { db } from "@/models";
import { apiHandler } from "@/util/api";
// import createHttpError from "http-errors";
import { NextRequest, NextResponse } from "next/server";

export const POST = apiHandler(async (req) => {
  const input: {
    threadId: string;
  } = await req.json();

  const response = await db.models.AssistantThread.create({
    assistantThreadId: input.threadId,
  });

  return NextResponse.json({ response });
});
