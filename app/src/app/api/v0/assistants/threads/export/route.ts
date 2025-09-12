/**
 * @swagger
 * /api/v0/assistants/threads/export:
 *   post:
 *     tags:
 *       - Assistants Threads
 *     summary: Save an assistant thread reference in the database.
 *     description: Persists the external Assistant thread ID associated with the configured Assistant. Requires a signed-in user (standard user is sufficient). Use this to keep a record of threads created via the Assistant API.
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
 *         description: Created database row wrapped in a data object.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     assistantThreadId:
 *                       type: string
 *                     assistantId:
 *                       type: string
 *                   additionalProperties: true
 *             examples:
 *               example:
 *                 value:
 *                   data:
 *                     assistantThreadId: "thread_abc123"
 *                     assistantId: "asst_123"
 *       400:
 *         description: Invalid threadId provided.
 *       500:
 *         description: Server error.
 */
import { db } from "@/models";
import { apiHandler } from "@/util/api";
import createHttpError from "http-errors";
import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/services/logger";

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
    logger.error({ err: error }, "Error writing AssistantThread to the DB:");
    throw createHttpError(500, "Server error");
  }
});
