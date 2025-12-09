/**
 * @swagger
 * /api/v1/chat/messages:
 *   post:
 *     tags:
 *       - Chat
 *     operationId: postChatMessages
 *     summary: Send message to chat thread and stream AI response
 *     description: Sends a user message to an existing CA thread and streams the AI response back. Handles token refresh and error bubbling automatically.
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
 *                 description: Thread ID from previous thread creation
 *               content:
 *                 type: string
 *                 description: User message content
 *               options:
 *                 type: object
 *                 description: Optional parameters (model, temperature, etc.)
 *     responses:
 *       200:
 *         description: Server-sent event stream of AI response
 *         content:
 *           text/event-stream:
 *             schema:
 *               type: string
 *             examples:
 *               message:
 *                 value: |
 *                   event: message
 *                   data: {"index": 0, "content": "Hello"}
 *
 *                   event: done
 *                   data: {"ok": true, "request_id": "123"}
 *               error:
 *                 value: |
 *                   event: error
 *                   data: {"message": "Service unavailable"}
 *       400:
 *         description: Invalid request parameters
 *       401:
 *         description: Unauthorized
 */

import { apiHandler } from "@/util/api";
import { NextResponse } from "next/server";
import { logger } from "@/services/logger";

export const POST = apiHandler(async (req, { session }) => {
  try {
    // Session validation
    if (!session?.user?.id) {
      throw new Error("User authentication required");
    }

    const { threadId, content, options } = await req.json();

    if (!threadId || !content) {
      return NextResponse.json(
        { error: "threadId and content are required" },
        { status: 400 },
      );
    }

    logger.info(
      {
        user_id: session.user.id,
        thread_id: threadId,
        content_length: content.length,
        has_options: !!options,
      },
      "Sending message to CA thread",
    );

    // Call CA messages endpoint
    const caResponse = await fetch(`${process.env.CA_BASE_URL}/v1/messages`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Request-ID": `cc-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      },
      body: JSON.stringify({
        thread_id: threadId,
        user_id: session.user.id,
        content,
        options: options || {},
      }),
    });

    if (!caResponse.ok) {
      const errorText = await caResponse.text();
      logger.error(
        {
          status: caResponse.status,
          error: errorText,
          user_id: session.user.id,
          thread_id: threadId,
        },
        "CA message request failed",
      );

      throw new Error(`CA service error: ${caResponse.status} - ${errorText}`);
    }

    logger.info(
      {
        user_id: session.user.id,
        thread_id: threadId,
        ca_response_status: caResponse.status,
      },
      "CA message request successful, streaming response",
    );

    // Stream response back to browser with proper headers
    return new NextResponse(caResponse.body, {
      status: 200,
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (error: any) {
    logger.error(
      {
        error: error.message,
        stack: error.stack,
        user_id: session?.user?.id,
      },
      "Failed to send chat message",
    );

    // Return error as SSE event for chat interface
    const errorEvent = `event: error\ndata: ${JSON.stringify({
      message: error.message || "Chat service unavailable",
      timestamp: new Date().toISOString(),
    })}\n\n`;

    const errorStream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(errorEvent));

        // Send done event with error status
        const doneEvent = `event: done\ndata: ${JSON.stringify({
          ok: false,
          error: error.message || "Chat service unavailable",
        })}\n\n`;

        controller.enqueue(new TextEncoder().encode(doneEvent));
        controller.close();
      },
    });

    return new NextResponse(errorStream, {
      status: 200, // SSE streams should return 200 even for errors
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      },
    });
  }
});
