/** @jest-environment jsdom */

import { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, jest } from "@jest/globals";
import type { SSEStreamOptions } from "@/hooks/useSSEStream";

let streamOptions: SSEStreamOptions;
const startStream = jest.fn(async (_url: string, _init?: RequestInit) => {});
const refreshDraft = jest.fn();
// Stable like i18next's: history reloads whenever `t` changes.
const t = (key: string) => key;
jest.unstable_mockModule("@/i18n/client", () => ({
  useTranslation: () => ({ t }),
}));
jest.unstable_mockModule("@/hooks/useSSEStream", () => ({
  STREAM_STALLED_CODE: "stream_stalled",
  useSSEStream: (options: SSEStreamOptions) => {
    streamOptions = options;
    return { startStream, stopStream: jest.fn() };
  },
}));

const { useConceptNoteChat } =
  await import("@/components/ConceptNoteWorkspace/use-concept-note-chat");

let chat: ReturnType<typeof useConceptNoteChat>;
let root: Root;
let historyOk = true;
const originalFetch = globalThis.fetch;

function Harness() {
  const current = useConceptNoteChat({
    lng: "en",
    runId: "run",
    threadId: "thread",
    onDraftOverviewComplete: refreshDraft,
  });
  useEffect(() => {
    chat = current;
  });
  return null;
}

function lastRequestBody(): Record<string, unknown> {
  const init = startStream.mock.calls.at(-1)?.[1];
  return JSON.parse(String(init?.body));
}

beforeEach(async () => {
  historyOk = true;
  startStream.mockClear();
  refreshDraft.mockClear();
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  globalThis.fetch = jest.fn(async () => ({
    ok: historyOk,
    json: async () => ({ messages: [] }),
  })) as unknown as typeof fetch;
  root = createRoot(document.createElement("div"));
  await act(async () => root.render(<Harness />));
});

afterEach(async () => {
  await act(async () => root.unmount());
  globalThis.fetch = originalFetch;
  globalThis.IS_REACT_ACT_ENVIRONMENT = false;
});

it("reports connected only after the history call succeeds", () => {
  expect(chat.connection).toBe("connected");
  expect(chat.canRetry).toBe(false);
});

it("turns an error event inside an HTTP 200 stream into a retryable error", async () => {
  await act(async () => chat.sendMessage("What is the budget?"));
  await act(async () =>
    streamOptions.onError?.("Streaming error occurred", undefined, {
      streamStarted: true,
    }),
  );

  expect(chat.connection).toBe("error");
  expect(chat.error).toBe("chat-send-error");
  expect(chat.canRetry).toBe(true);
});

it("names an unreachable service and a stalled stream", async () => {
  await act(async () => chat.sendMessage("Hello"));
  await act(async () =>
    streamOptions.onError?.("Chat service unavailable", undefined, {
      status: 502,
      streamStarted: false,
    }),
  );
  expect(chat.error).toBe("chat-service-unavailable");

  await act(async () => chat.sendMessage("Hello again"));
  await act(async () =>
    streamOptions.onError?.("stalled", "stream_stalled", {
      status: 200,
      streamStarted: true,
    }),
  );
  expect(chat.error).toBe("chat-stream-stalled");
  expect(chat.connection).toBe("error");
});

it("retries the failed question once, marked as a retry, then reconnects", async () => {
  await act(async () => chat.sendMessage("What is the budget?"));
  await act(async () =>
    streamOptions.onError?.("failed", undefined, { streamStarted: true }),
  );
  const userBubbles = () =>
    chat.messages.filter((message) => message.role === "user").length;
  expect(userBubbles()).toBe(1);

  await act(async () => chat.retry());

  expect(chat.connection).toBe("retrying");
  expect(lastRequestBody()).toMatchObject({
    content: "What is the budget?",
    options: { concept_note_turn: "retry" },
  });
  expect(userBubbles()).toBe(1);

  await act(async () => streamOptions.onMessage?.("About 2M EUR", 0));
  await act(async () => streamOptions.onComplete?.());
  expect(chat.connection).toBe("connected");
  expect(chat.error).toBeNull();
  expect(chat.messages.at(-1)?.text).toBe("About 2M EUR");
});

it("treats any message sent after a failure as the reconnect attempt", async () => {
  await act(async () => chat.sendMessage("First"));
  await act(async () =>
    streamOptions.onError?.("failed", undefined, { streamStarted: true }),
  );
  await act(async () => chat.sendMessage("Second"));

  expect(chat.connection).toBe("retrying");

  await act(async () =>
    streamOptions.onError?.("failed", undefined, { streamStarted: true }),
  );
  expect(chat.connection).toBe("error");
});

it("keeps the connection when Clima declines because context is not ready", async () => {
  await act(async () => chat.sendMessage("Hello"));
  await act(async () =>
    streamOptions.onError?.("not ready", "concept_note_context_not_ready", {
      status: 409,
      streamStarted: false,
    }),
  );

  expect(chat.connection).toBe("connected");
  expect(chat.error).toBe("chat-context-not-ready");
  expect(chat.canRetry).toBe(false);
});

it("retries a failed drafting overview as an overview turn", async () => {
  await act(async () => chat.requestDraftOverview());
  await act(async () =>
    streamOptions.onError?.("failed", undefined, { streamStarted: true }),
  );
  expect(chat.overviewFailed).toBe(true);
  expect(chat.error).toBe("chat-overview-error");

  await act(async () => chat.retry());
  expect(lastRequestBody()).toMatchObject({
    options: { concept_note_turn: "draft_overview" },
  });
  await act(async () => streamOptions.onComplete?.());

  expect(chat.overviewFailed).toBe(false);
  expect(refreshDraft).toHaveBeenCalledTimes(1);
});

it("reloads a failed history on retry", async () => {
  await act(async () => root.unmount());
  historyOk = false;
  root = createRoot(document.createElement("div"));
  await act(async () => root.render(<Harness />));
  expect(chat.connection).toBe("error");
  expect(chat.error).toBe("chat-history-error");

  historyOk = true;
  await act(async () => chat.retry());

  expect(chat.connection).toBe("connected");
  expect(chat.error).toBeNull();
});
