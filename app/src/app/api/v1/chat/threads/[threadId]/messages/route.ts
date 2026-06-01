import { apiHandler } from "@/util/api";
import { NextResponse } from "next/server";

export const GET = apiHandler(async (req, { session, params }) => {
  if (!session?.user?.id) {
    return NextResponse.json(
      { error: "User authentication required" },
      { status: 401 },
    );
  }

  const searchParams = new URL(req.url).searchParams;
  const limit = searchParams.get("limit");
  const threadId = params.threadId;
  const caUrl = new URL(
    `${process.env.CA_BASE_URL}/v1/threads/${threadId}/messages`,
  );
  caUrl.searchParams.set("user_id", session.user.id);
  if (limit) {
    caUrl.searchParams.set("limit", limit);
  }

  const caResponse = await fetch(caUrl.toString(), {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
    },
  });

  const text = await caResponse.text();
  let payload: unknown = {};
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = { detail: text };
    }
  }

  if (!caResponse.ok) {
    return NextResponse.json(
      payload || { error: "Failed to load thread messages" },
      { status: caResponse.status },
    );
  }

  return NextResponse.json(payload);
});
