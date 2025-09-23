/**
 * @swagger
 * /api/v0/assistants/threads/{inventory}/retrieve:
 *   post:
 *     tags:
 *       - Assistants Threads
 *     summary: Retrieve details for an existing assistant thread.
 *     description: Looks up a thread by ID using the Assistant API. Requires a signed-in user with access to the referenced inventory. Use this to restore a thread session on page reload.
 *     parameters:
 *       - in: path
 *         name: inventory
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [threadId]
 *             properties:
 *               threadId:
 *                 type: string
 *     responses:
 *       200:
 *         description: Thread payload from provider.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 thread:
 *                   type: object
 *                   additionalProperties: true
 *             examples:
 *               example:
 *                 value:
 *                   thread:
 *                     id: "thread_abc123"
 *                     object: "thread"
 *       500:
 *         description: Failed to retrieve thread.
 */
import { apiHandler } from "@/util/api";
import { setupOpenAI } from "@/util/openai";
import { NextResponse } from "next/server";
import { logger } from "@/services/logger";

export const POST = apiHandler(async (req) => {
  try {
    const input = await req.json();

    const threadId = input.threadId;

    const openai = setupOpenAI();
    const thread = await openai.beta.threads.retrieve(threadId);

    return NextResponse.json({ thread: thread });
  } catch (error) {
    logger.error({ err: error }, "Error retrieving thread:");
    return NextResponse.json(
      { error: "Failed to retrieve thread." },
      { status: 500 },
    );
  }
});
