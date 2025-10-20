/**
 * @swagger
 * /api/v1/chat/threads:
 *   post:
 *     tags:
 *       - Chat
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
import { apiHandler } from "@/util/api";
import { NextResponse } from "next/server";
import { logger } from "@/services/logger";

interface TokenResponse {
  access_token: string;
  expires_in: number;
  token_type: string;
}

const createThreadRequest = z.object({
  title: z.string().optional(),
  inventory_id: z.string().optional(),
});

async function issueCaUserToken(params: {
  user_id: string;
  inventory_id?: string;
}): Promise<TokenResponse> {
  const response = await fetch(
    `${process.env.CC_BASE_URL}/api/v1/internal/ca/user-token`,
    {
      method: "POST",
      headers: {
        "X-CA-Service-Key": process.env.CA_SERVICE_API_KEY!,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(params),
    },
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Token issuance failed: ${response.status} - ${errorText}`);
  }

  return response.json();
}

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

    // Auto-issue token for CA (seamless)
    const tokenData = await issueCaUserToken({
      user_id: session.user.id,
      inventory_id,
    });

    logger.debug(
      {
        user_id: session.user.id,
        token_expires_in: tokenData.expires_in,
      },
      "CA user token issued successfully",
    );

    // Create CA thread with token and context
    const caResponse = await fetch(`${process.env.CA_BASE_URL}/v1/threads`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        user_id: session.user.id,
        inventory_id,
        context: {
          access_token: tokenData.access_token,
          expires_in: tokenData.expires_in,
          token_type: tokenData.token_type,
          issued_at: new Date().toISOString(),
        },
      }),
    });

    if (!caResponse.ok) {
      const errorText = await caResponse.text();
      logger.error(
        {
          status: caResponse.status,
          error: errorText,
          user_id: session.user.id,
        },
        "CA thread creation failed",
      );
      throw new Error(`CA service error: ${caResponse.status} - ${errorText}`);
    }

    const caData = await caResponse.json();

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
