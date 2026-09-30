/**
 * @swagger
 * /api/v1/chat/messages:
 *   post:
 *     tags:
 *       - chat
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
 *       400:
 *         description: Invalid request parameters
 *       401:
 *         description: Unauthorized
 *       409:
 *         description: Concept Note document context is not ready (concept_note_context_not_ready), or no finished draft is waiting for its chat overview (concept_note_draft_overview_unavailable)
 *       502:
 *         description: Climate Advisor transport or gateway failure
 *       503:
 *         description: Climate Advisor or its context storage is unavailable
 */

import createHttpError from "http-errors";
import { NextResponse } from "next/server";
import { requireExistingChatUser } from "@/backend/chat/authorization";
import {
  callClimateAdvisorChat,
  extractClimateAdvisorErrorMessage,
  readClimateAdvisorResponsePayload,
} from "@/backend/chat/climate-advisor";
import { issueClimateAdvisorUserToken } from "@/backend/climate-advisor-token";
import { buildClimateAdvisorMessagePayload } from "@/backend/chat/message-payload";
import { logger } from "@/services/logger";
import { apiHandler } from "@/util/api";

// Conflict codes the Concept Note chat handles; other CA errors stay opaque.
const FORWARDED_CONFLICT_CODES = new Set([
  "concept_note_context_not_ready",
  "concept_note_draft_overview_unavailable",
]);

export const POST = apiHandler(async (req, { session }) => {
  if (!session?.user?.id) {
    throw new createHttpError.Unauthorized("User authentication required");
  }

  const body = await req.json();
  const { threadId, content, options, context, inventory_id, inventoryId } =
    body;

  if (!threadId || !content) {
    return NextResponse.json(
      { error: "threadId and content are required" },
      { status: 400 },
    );
  }

  await requireExistingChatUser(session.user.id);

  logger.info(
    {
      user_id: session.user.id,
      thread_id: threadId,
      content_length: content.length,
      inventory_id: inventory_id ?? inventoryId,
      has_context: !!context,
      has_options: !!options,
    },
    "Sending message to CA thread",
  );

  let caResponse: Response;
  try {
    const token = await issueClimateAdvisorUserToken({
      userId: session.user.id,
      inventoryId: inventory_id ?? inventoryId,
    });

    caResponse = await callClimateAdvisorChat({
      path: "/v1/messages",
      method: "POST",
      headers: {
        "X-Request-ID": `cc-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      },
      body: buildClimateAdvisorMessagePayload({
        userId: session.user.id,
        accessToken: token.access_token,
        body,
      }),
    });
  } catch (error: unknown) {
    const isHttpError = createHttpError.isHttpError(error);
    const status = isHttpError ? error.statusCode : 502;
    const message =
      isHttpError && error.expose ? error.message : "Chat service unavailable";
    logger.error(
      {
        status,
        error: error instanceof Error ? error.message : String(error),
        user_id: session.user.id,
        thread_id: threadId,
      },
      "Failed to start CA message request",
    );
    return NextResponse.json({ message }, { status });
  }

  if (!caResponse.ok) {
    const payload = await readClimateAdvisorResponsePayload(caResponse);
    const detail =
      payload && typeof payload === "object" && "detail" in payload
        ? payload.detail
        : null;
    if (
      caResponse.status === 409 &&
      detail &&
      typeof detail === "object" &&
      "code" in detail &&
      typeof detail.code === "string" &&
      FORWARDED_CONFLICT_CODES.has(detail.code)
    ) {
      return NextResponse.json(detail, { status: 409 });
    }
    const errorMessage = extractClimateAdvisorErrorMessage(
      payload,
      `CA service error (${caResponse.status})`,
    );
    logger.error(
      {
        status: caResponse.status,
        error: payload,
        user_id: session.user.id,
        thread_id: threadId,
      },
      "CA message request failed",
    );
    return NextResponse.json(
      { message: errorMessage },
      { status: caResponse.status },
    );
  }

  logger.info(
    {
      user_id: session.user.id,
      thread_id: threadId,
      ca_response_status: caResponse.status,
    },
    "CA message request successful, streaming response",
  );

  return new NextResponse(caResponse.body, {
    status: 200,
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
});
