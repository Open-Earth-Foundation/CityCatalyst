/**
 * @swagger
 * /api/v0/assistants/threads/{inventory}/retrieve:
 *   post:
 *     tags:
 *       - Assistants Threads
 *     summary: Retrieve a thread by ID
 *     description: Retrieves an assistant thread using its identifier.
 *     parameters:
 *       - in: path
 *         name: inventory
 *         required: true
 *         schema:
 *           type: string
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
 *         description: Thread retrieved successfully.
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
