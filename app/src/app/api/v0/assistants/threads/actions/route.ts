import { apiHandler } from "@/util/api";
import { openai } from "@/util/openai";
import { NextResponse } from "next/server";

// Send a new message to a thread
export const POST = apiHandler(async (req) => {
  const { threadId, runId, toolCallOutputs } = await req.json();

  const stream = openai.beta.threads.runs.submitToolOutputsStream(
    threadId,
    runId,
    { tool_outputs: toolCallOutputs },
  );

  return new NextResponse(stream.toReadableStream());
});
