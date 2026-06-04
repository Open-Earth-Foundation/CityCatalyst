/**
 * @swagger
 * /api/v1/chat/threads:
 *   post:
 *     tags:
 *       - chat
 *     operationId: postChatThreads
 *     summary: Create a new chat thread via Climate Advisor
 *     description: Creates a persistent conversation thread in the Climate Advisor service with auto-issued user token. The thread maintains context and conversation history across multiple message exchanges.
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               title:
 *                 type: string
 *                 description: Optional thread title
 *               inventory_id:
 *                 type: string
 *                 format: uuid
 *                 description: Optional inventory UUID for chat context
 *     responses:
 *       200:
 *         description: Chat thread created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 threadId:
 *                   type: string
 *                   description: CA thread ID for subsequent messages
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Failed to create chat thread
 */

import { z } from "zod";
import { NextResponse } from "next/server";
import { createClimateAdvisorThread } from "@/backend/chat/climate-advisor";
import { logger } from "@/services/logger";
import { apiHandler } from "@/util/api";

const createThreadRequest = z.object({
  title: z.string().optional(),
  inventory_id: z.string().optional(),
});

export const POST = apiHandler(async (req, { session }) => {
  try {
    // Session validation (seamless for user)
    if (!session?.user?.id) {
      throw new Error("User authentication required");
    }

    const requestBody = await req.json().catch(() => ({}));
    const { title, inventory_id } = createThreadRequest.parse(requestBody);

    logger.info(
      {
        user_id: session.user.id,
        inventory_id,
        has_title: !!title,
      },
      "Creating CA chat thread",
    );

    const caData = await createClimateAdvisorThread({
      origin: req.nextUrl.origin,
      userId: session.user.id,
      inventoryId: inventory_id,
    });

    logger.debug(
      {
        user_id: session.user.id,
        thread_id: caData.thread_id,
      },
      "CA chat thread created via shared proxy",
    );

    logger.info(
      {
        user_id: session.user.id,
        thread_id: caData.thread_id,
        inventory_id,
      },
      "CA chat thread created successfully",
    );

    return NextResponse.json({
      threadId: caData.thread_id,
    });
  } catch (error: any) {
    logger.error(
      {
        error: error.message,
        stack: error.stack,
        user_id: session?.user?.id,
      },
      "Failed to create chat thread",
    );

    // Bubble up errors to chat interface
    return NextResponse.json(
      {
        error: error.message || "Failed to create chat thread",
        details: "Please try again or contact support if the issue persists",
      },
      { status: 500 },
    );
  }
});
