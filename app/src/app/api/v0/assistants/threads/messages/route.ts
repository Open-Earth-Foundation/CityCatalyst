import { apiHandler } from "@/util/api";
import { setupOpenAI } from "@/util/openai";
import { NextResponse } from "next/server";

const assistantId = process.env.OPENAI_ASSISTANT_ID as string;

// Send a new message to a thread
export const POST = apiHandler(async (req) => {
  const input: {
    threadId: string;
    content: string;
  } = await req.json();

  const openai = setupOpenAI();

  const threadId = input.threadId;

  // Add a user message on the thread
  const createdMessage = await openai.beta.threads.messages.create(threadId, {
    role: "user",
    content: input.content,
  });

  // Run the thread with streaming output
  const stream = openai.beta.threads.runs.stream(threadId, {
    assistant_id: assistantId,
  });

  return new NextResponse(stream.toReadableStream());
});
