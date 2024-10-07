import { db } from "@/models";
import { apiHandler } from "@/util/api";
import createHttpError from "http-errors";
import { NextRequest, NextResponse } from "next/server";

const assistantId = process.env.OPENAI_ASSISTANT_ID as string;

export const POST = apiHandler(async (req) => {
  try {
    const input: {
      threadId: string;
    } = await req.json();

    if (!input.threadId || typeof input.threadId !== "string") {
      return NextResponse.json(
        { error: "Invalid threadId provided" },
        { status: 400 },
      );
    }

    const response = await db.models.AssistantThread.create({
      assistantThreadId: input.threadId,
      assistantId: assistantId,
    });

    return NextResponse.json({ data: response });
  } catch (error) {
    console.error("Error writing AssistantThread to the DB:", error);
    throw createHttpError(500, "Server error");
  }
});
