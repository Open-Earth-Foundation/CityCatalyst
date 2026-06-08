import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";
import { NextRequest } from "next/server";
import { POST as postChatMessage } from "@/app/api/v1/chat/messages/route";
import { GET as getThreadMessages } from "@/app/api/v1/chat/threads/[threadId]/messages/route";
import { POST as postChatThread } from "@/app/api/v1/chat/threads/route";
import { Auth, type AppSession } from "@/lib/auth";
import { db } from "@/models";
import { Roles } from "@/util/types";

const testUserID = "beb9634a-b68c-4c1b-a20b-2ab0ced5e3c2";
const testInventoryId = "22222222-2222-4222-8222-222222222222";

/**
 * Create a route request with an optional mocked JSON body.
 */
function makeRequest(
  url: string,
  method: "GET" | "POST",
  body?: unknown,
): NextRequest {
  const request = new NextRequest(new URL(url), { method });
  if (body !== undefined) {
    request.json = jest.fn(async () => body) as unknown as typeof request.json;
  }
  return request;
}

/**
 * Create a JSON fetch response for route proxy tests.
 */
function jsonResponse(payload: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json");
  return new Response(JSON.stringify(payload), { ...init, headers });
}

describe("Chat routes", () => {
  const originalFetch = global.fetch;
  const originalCaBaseUrl = process.env.CA_BASE_URL;
  const originalServiceKey = process.env.CC_SERVICE_API_KEY;
  const originalDbInitialized = db.initialized;
  let sessionSpy: ReturnType<typeof jest.spyOn>;

  beforeAll(() => {
    const expires = new Date();
    expires.setDate(expires.getDate() + 1);

    sessionSpy = jest.spyOn(Auth, "getServerSession").mockResolvedValue({
      user: {
        id: testUserID,
        name: "Test User",
        email: "test@example.com",
        image: null,
        role: Roles.User,
      },
      expires: expires.toISOString(),
    } as AppSession);
  });

  beforeEach(() => {
    process.env.CA_BASE_URL = "http://ca.example";
    process.env.CC_SERVICE_API_KEY = "cc-service-key";
    db.initialized = true;
    global.fetch = jest.fn() as unknown as typeof fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.clearAllMocks();
  });

  afterAll(() => {
    db.initialized = originalDbInitialized;
    process.env.CA_BASE_URL = originalCaBaseUrl;
    process.env.CC_SERVICE_API_KEY = originalServiceKey;
    sessionSpy.mockRestore();
  });

  it("creates a CA thread through the shared backend helper", async () => {
    const fetchMock = global.fetch as jest.MockedFunction<typeof fetch>;
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          access_token: "token-123",
          expires_in: 3600,
          token_type: "Bearer",
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse(
          {
            thread_id: "thread-1",
          },
          { status: 201 },
        ),
      );

    const response = await postChatThread(
      makeRequest("http://localhost:3000/api/v1/chat/threads", "POST", {
        title: "Stationary energy",
        inventory_id: testInventoryId,
      }),
      { params: Promise.resolve({}) },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ threadId: "thread-1" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "http://localhost:3000/api/v1/internal/ca/user-token",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          user_id: testUserID,
          inventory_id: testInventoryId,
        }),
      }),
    );

    const [, createThreadRequest] = fetchMock.mock.calls[1] ?? [];
    const createThreadHeaders = new Headers(createThreadRequest?.headers);
    const createThreadBody = JSON.parse(String(createThreadRequest?.body));
    expect(fetchMock.mock.calls[1]?.[0]).toBe("http://ca.example/v1/threads");
    expect(createThreadRequest?.method).toBe("POST");
    expect(createThreadBody).toEqual({
      user_id: testUserID,
      inventory_id: testInventoryId,
      context: expect.objectContaining({
        access_token: "token-123",
        expires_in: 3600,
        token_type: "Bearer",
        issued_at: expect.any(String),
      }),
    });
    expect(createThreadHeaders.get("Content-Type")).toBe("application/json");
  });

  it("streams chat messages through the shared CA proxy helper", async () => {
    const fetchMock = global.fetch as jest.MockedFunction<typeof fetch>;
    fetchMock.mockResolvedValueOnce(
      new Response(
        'event: message\ndata: {"index":0,"content":"Hello"}\n\n' +
          'event: done\ndata: {"ok":true}\n\n',
        {
          status: 200,
          headers: {
            "Content-Type": "text/event-stream",
          },
        },
      ),
    );

    const response = await postChatMessage(
      makeRequest("http://localhost:3000/api/v1/chat/messages", "POST", {
        threadId: "thread-1",
        content: "Hello",
        inventory_id: testInventoryId,
        context: {
          stationary_energy_draft_run_id: "draft-1",
        },
        options: {
          stationary_energy_draft_run_id: "draft-1",
        },
      }),
      { params: Promise.resolve({}) },
    );

    expect(response.status).toBe(200);
    await expect(response.text()).resolves.toContain("event: message");

    const [url, requestInit] = fetchMock.mock.calls[0] ?? [];
    const headers = new Headers(requestInit?.headers);
    expect(url).toBe("http://ca.example/v1/messages");
    expect(requestInit).toEqual(
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          thread_id: "thread-1",
          user_id: testUserID,
          content: "Hello",
          inventory_id: testInventoryId,
          context: {
            stationary_energy_draft_run_id: "draft-1",
          },
          options: {
            stationary_energy_draft_run_id: "draft-1",
          },
        }),
      }),
    );
    expect(headers.get("Content-Type")).toBe("application/json");
    expect(headers.get("X-Request-ID")).toMatch(/^cc-/);
  });

  it("loads thread messages through the shared CA proxy helper", async () => {
    const fetchMock = global.fetch as jest.MockedFunction<typeof fetch>;
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        thread_id: "thread-1",
        messages: [
          {
            message_id: "message-1",
            role: "user",
            text: "Hello",
            created_at: "2026-06-04T12:00:00Z",
          },
        ],
      }),
    );

    const response = await getThreadMessages(
      makeRequest(
        "http://localhost:3000/api/v1/chat/threads/thread-1/messages?limit=2",
        "GET",
      ),
      { params: Promise.resolve({ threadId: "thread-1" }) },
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      thread_id: "thread-1",
      messages: [
        {
          message_id: "message-1",
          role: "user",
          text: "Hello",
          created_at: "2026-06-04T12:00:00Z",
        },
      ],
    });

    const requestUrl = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(requestUrl.origin + requestUrl.pathname).toBe(
      "http://ca.example/v1/threads/thread-1/messages",
    );
    expect(requestUrl.searchParams.get("user_id")).toBe(testUserID);
    expect(requestUrl.searchParams.get("limit")).toBe("2");
  });

  it("forwards CA error payloads when loading thread messages fails", async () => {
    const fetchMock = global.fetch as jest.MockedFunction<typeof fetch>;
    fetchMock.mockResolvedValueOnce(
      jsonResponse(
        {
          detail: "thread not found",
        },
        { status: 404 },
      ),
    );

    const response = await getThreadMessages(
      makeRequest(
        "http://localhost:3000/api/v1/chat/threads/thread-missing/messages",
        "GET",
      ),
      { params: Promise.resolve({ threadId: "thread-missing" }) },
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      detail: "thread not found",
    });
  });
});
