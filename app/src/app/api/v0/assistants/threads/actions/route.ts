/**
 * @swagger
 * /api/v0/assistants/threads/actions:
 *   post:
 *     tags:
 *       - Assistants Threads
 *     summary: Submit tool call outputs for a run
 *     description: Submits tool outputs to an existing assistant thread run and streams events.
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
 *         description: Stream of run events.
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
