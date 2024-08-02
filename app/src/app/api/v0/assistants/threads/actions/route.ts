import { apiHandler } from "@/util/api";
import { openai } from "@/util/openai";
import { NextResponse } from "next/server";

// Send a new message to a thread
export const POST = apiHandler(async (req) => {
  const { threadId, runId, toolCallOutputs } = await req.json();
  //const { toolCallOutputs, runId } = await req.json();
  console.log("server api call");
  console.log(threadId);
  console.log(runId);
  console.log(toolCallOutputs);

  const stream = openai.beta.threads.runs.submitToolOutputsStream(
    threadId,
    runId,
    // { tool_outputs: [{ output: result, tool_call_id: toolCallId }] },
    { tool_outputs: toolCallOutputs },
  );

  return new NextResponse(stream.toReadableStream());
});
