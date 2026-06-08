import { NextResponse } from "next/server";
import {
  callClimateAdvisorChat,
  readClimateAdvisorResponsePayload,
} from "@/backend/chat/climate-advisor";
import { apiHandler } from "@/util/api";

export const GET = apiHandler(
  async (_req, { session, params, searchParams }) => {
    if (!session?.user?.id) {
      return NextResponse.json(
        { error: "User authentication required" },
        { status: 401 },
      );
    }

    const threadId = params.threadId;
    const caResponse = await callClimateAdvisorChat({
      path: `/v1/threads/${threadId}/messages`,
      searchParams: {
        user_id: session.user.id,
        limit: searchParams.limit,
      },
    });
    const payload = await readClimateAdvisorResponsePayload(caResponse);

    if (!caResponse.ok) {
      return NextResponse.json(
        payload || { error: "Failed to load thread messages" },
        { status: caResponse.status },
      );
    }

    return NextResponse.json(payload);
  },
);
