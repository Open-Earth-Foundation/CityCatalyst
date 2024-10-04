import { apiHandler } from "@/util/api";
import { setupOpenAI } from "@/util/openai";
import { NextResponse } from "next/server";

export const POST = apiHandler(async (req) => {
  try {
    const input = await req.json();

    const threadId = input.threadId;

    const openai = setupOpenAI();
    const thread = await openai.beta.threads.retrieve(threadId);

    return NextResponse.json({ thread: thread });
  } catch (error) {
    console.error("Error retrieving thread:", error);
    return NextResponse.json(
      { error: "Failed to retrieve thread." },
      { status: 500 },
    );
  }
});
