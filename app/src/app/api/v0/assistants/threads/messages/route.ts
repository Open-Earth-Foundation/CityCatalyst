/**
 * @swagger
 * /api/v0/assistants/threads/messages:
 *   post:
 *     tags:
 *       - Assistants Threads
 *     summary: Append a user message to a thread and stream the run output.
 *     description: Adds a message to an existing thread and starts a run that streams incremental events (tool calls, deltas, completions). Requires a signed-in user who owns or can access the thread’s inventory context. The response is a streamed sequence of events, not a JSON object.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [threadId, content]
 *             properties:
 *               threadId:
 *                 type: string
 *               content:
 *                 type: string
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
 *                   event: message.delta
 *                   data: {"delta":"Hello"}
 */
import { apiHandler } from "@/util/api";
import { setupOpenAI } from "@/util/openai";
import { NextResponse } from "next/server";

const assistantId = process.env.OPENAI_ASSISTANT_ID as string;

// Create an AbortController
const controller = new AbortController();
const { signal } = controller;

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

  const stream = openai.beta.threads.runs.stream(
    threadId,
    {
      assistant_id: assistantId,
    },
    {
      signal,
    },
  );

  // TODO: prevent a new thread from being added to current run when active

  return new NextResponse(stream.toReadableStream());
});
