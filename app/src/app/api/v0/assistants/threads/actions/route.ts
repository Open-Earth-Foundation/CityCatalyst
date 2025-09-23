/**
 * @swagger
 * /api/v0/assistants/threads/actions:
 *   post:
 *     tags:
 *       - Assistants Threads
 *     summary: Submit tool outputs for an in‑flight run and stream updated events.
 *     description: Provides tool call outputs to a running thread and resumes streaming of events. Requires a signed-in user with access to the underlying inventory/thread. The response is a streamed sequence of events, not a JSON object.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [threadId, runId, toolCallOutputs]
 *             properties:
 *               threadId:
 *                 type: string
 *               runId:
 *                 type: string
 *               toolCallOutputs:
 *                 type: array
 *                 items:
 *                   type: object
 *     responses:
 *       200:
 *         description: Server-sent stream of Assistant events.
 *         content:
 *           text/event-stream:
 *             schema:
 *               type: string
 *             examples:
 *               example:
 *                 value: |
 *                   event: tool.outputs.submitted
 *                   data: {"status":"ok"}
 */
import { apiHandler } from "@/util/api";
import { setupOpenAI } from "@/util/openai";
import { NextResponse } from "next/server";

// Send a new message to a thread
export const POST = apiHandler(async (req) => {
  const { threadId, runId, toolCallOutputs } = await req.json();

  const openai = setupOpenAI();

  const stream = openai.beta.threads.runs.submitToolOutputsStream(
    threadId,
    runId,
    { tool_outputs: toolCallOutputs },
  );

  return new NextResponse(stream.toReadableStream());
});
