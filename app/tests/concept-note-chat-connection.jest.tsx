/** @jest-environment jsdom */

import { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, jest } from "@jest/globals";
import type { SSEStreamOptions } from "@/hooks/useSSEStream";

let streamOptions: SSEStreamOptions;
const startStream = jest.fn(async (_url: string, _init?: RequestInit) => {});
const refreshDraft = jest.fn();
const observedReplyEnd = jest.fn();
const threadInactive = jest.fn();
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
let historyReplyInProgress = false;
let historyMessages: unknown[] = [];
const originalFetch = globalThis.fetch;

function Harness() {
  const current = useConceptNoteChat({
    lng: "en",
    runId: "run",
    threadId: "thread",
    onDraftOverviewComplete: refreshDraft,
    onObservedReplyEnd: observedReplyEnd,
    onThreadInactive: threadInactive,
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

async function showChoiceQuestion() {
  await act(async () => chat.requestDraftOverview());
  await act(async () => {
    streamOptions.onMessage?.("Where should we start?");
    streamOptions.onToolResult?.({
      name: "concept_note_ask_question",
      options: ["Budget", "Partners"],
    });
    streamOptions.onComplete?.();
  });
  return chat.messages.at(-1)!;
}

beforeEach(async () => {
  historyOk = true;
  historyReplyInProgress = false;
  observedReplyEnd.mockClear();
  historyMessages = [];
  startStream.mockClear();
  refreshDraft.mockClear();
  threadInactive.mockClear();
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  globalThis.fetch = jest.fn(async () => ({
    ok: historyOk,
    json: async () => ({
      messages: historyMessages,
      reply_in_progress: historyReplyInProgress,
    }),
  })) as unknown as typeof fetch;
  root = createRoot(document.createElement("div"));
  await act(async () => root.render(<Harness />));
});

afterEach(async () => {
  await act(async () => root.unmount());
  jest.useRealTimers();
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

it("clears an old failed turn when a new message is rejected for unready context", async () => {
  await act(async () => chat.sendMessage("Old failed question"));
  await act(async () =>
    streamOptions.onError?.("failed", undefined, { streamStarted: true }),
  );
  await act(async () => chat.sendMessage("Rejected question"));
  await act(async () =>
    streamOptions.onError?.("not ready", "concept_note_context_not_ready", {
      status: 409,
      streamStarted: false,
    }),
  );

  expect(chat.connection).toBe("connected");
  expect(chat.error).toBe("chat-context-not-ready");
  expect(chat.canRetry).toBe(false);
  expect(chat.messages.filter((message) => message.role === "user")).toEqual([
    expect.objectContaining({ text: "Old failed question" }),
  ]);

  await act(async () => chat.retry());
  expect(startStream).toHaveBeenCalledTimes(2);
});

it.each([
  [400, "chat-request-rejected"],
  [401, "chat-auth-required"],
  [403, "chat-access-denied"],
  [404, "chat-not-found"],
  [409, "chat-request-rejected"],
  [422, "chat-request-rejected"],
] as const)(
  "does not offer retry or report a connection problem for HTTP %s",
  async (status, errorKey) => {
    await act(async () => chat.sendMessage("Old failed question"));
    await act(async () =>
      streamOptions.onError?.("failed", undefined, { streamStarted: true }),
    );
    await act(async () => chat.sendMessage("New question"));
    await act(async () =>
      streamOptions.onError?.("request rejected", undefined, {
        status,
        streamStarted: false,
      }),
    );

    expect(chat.connection).toBe("connected");
    expect(chat.error).toBe(errorKey);
    expect(chat.canRetry).toBe(false);
    await act(async () => chat.retry());
    expect(startStream).toHaveBeenCalledTimes(2);
  },
);

it.each([408, 429])(
  "allows retry for transient HTTP %s responses",
  async (status) => {
    await act(async () => chat.sendMessage("Question"));
    await act(async () =>
      streamOptions.onError?.("temporarily unavailable", undefined, {
        status,
        streamStarted: false,
      }),
    );

    expect(chat.connection).toBe("error");
    expect(chat.canRetry).toBe(true);
    await act(async () => chat.retry());
    expect(lastRequestBody()).toMatchObject({
      content: "Question",
      options: { concept_note_turn: "retry" },
    });
  },
);

it.each([
  [400, undefined, "chat-request-rejected"],
  [401, undefined, "chat-auth-required"],
  [403, undefined, "chat-access-denied"],
  [404, undefined, "chat-not-found"],
  [409, undefined, "chat-request-rejected"],
  [422, undefined, "chat-request-rejected"],
  [409, "concept_note_context_not_ready", "chat-context-not-ready"],
] as const)(
  "makes the original choices usable after a rejected answer (%s, %s)",
  async (status, code, errorKey) => {
    const question = await showChoiceQuestion();
    await act(async () => chat.sendMessage("Budget"));
    await act(async () =>
      streamOptions.onError?.("request rejected", code, {
        status,
        streamStarted: false,
      }),
    );

    // The panel treats a question as answered when a later message exists.
    expect(chat.messages).toEqual([question]);
    expect(chat.messages.at(-1)?.choices).toEqual(["Budget", "Partners"]);
    expect(chat.isGenerating).toBe(false);
    expect(chat.error).toBe(errorKey);
    expect(chat.canRetry).toBe(false);
    expect(chat.connection).toBe("connected");

    await act(async () => chat.sendMessage("Partners"));
    expect(lastRequestBody().content).toBe("Partners");
    expect(chat.messages.filter((message) => message.role === "user")).toEqual([
      expect.objectContaining({ text: "Partners" }),
    ]);
  },
);

it.each([408, 429, 502])(
  "keeps the pending answer and edit idempotency key for retryable HTTP %s",
  async (status) => {
    await showChoiceQuestion();
    await act(async () => chat.sendMessage("Budget", { kind: "auto" }));
    const originalContext = lastRequestBody().context;
    expect(originalContext).toMatchObject({
      concept_note_edit: { idempotency_key: expect.any(String) },
    });
    await act(async () =>
      streamOptions.onError?.("temporarily unavailable", undefined, {
        status,
        streamStarted: false,
      }),
    );

    expect(chat.messages.at(-1)).toMatchObject({
      role: "user",
      text: "Budget",
    });
    expect(chat.canRetry).toBe(true);
    await act(async () => chat.retry());
    expect(lastRequestBody()).toMatchObject({
      content: "Budget",
      context: originalContext,
      options: { concept_note_turn: "retry" },
    });
    expect(
      chat.messages.filter((message) => message.role === "user"),
    ).toHaveLength(1);
  },
);

it.each([undefined, "stream_stalled"])(
  "removes choices from a failed streamed question and keeps partial text (%s)",
  async (code) => {
    await act(async () => chat.sendMessage("Help me choose the next step"));
    await act(async () => {
      streamOptions.onMessage?.("Which approach?");
      streamOptions.onToolResult?.({
        name: "concept_note_ask_question",
        options: ["Detailed", "Brief"],
      });
    });
    expect(chat.messages.at(-1)?.choices).toEqual(["Detailed", "Brief"]);

    await act(async () =>
      streamOptions.onError?.("Connection lost", code, { streamStarted: true }),
    );
    expect(chat.messages.at(-1)).toMatchObject({ text: "Which approach?" });
    expect(chat.messages.at(-1)?.choices).toBeUndefined();
    expect(chat.isGenerating).toBe(false);
    expect(chat.canRetry).toBe(true);

    await act(async () => chat.retry());
    await act(async () =>
      streamOptions.onError?.("Unavailable", undefined, {
        status: 502,
        streamStarted: false,
      }),
    );
    // Even when retry fails before any output, the old partial card stays inert.
    expect(chat.messages.some((message) => message.choices)).toBe(false);
    await act(async () => chat.retry());
    await act(async () => {
      streamOptions.onMessage?.("Which scope?");
      streamOptions.onToolResult?.({
        name: "concept_note_ask_question",
        options: ["Citywide", "Pilot"],
      });
      streamOptions.onComplete?.();
    });
    expect(chat.messages.filter((message) => message.choices)).toEqual([
      expect.objectContaining({
        text: "Which scope?",
        choices: ["Citywide", "Pilot"],
      }),
    ]);
    expect(chat.connection).toBe("connected");
    expect(chat.error).toBeNull();
  },
);

it("drops an empty failed assistant even when choices arrived before its text", async () => {
  await act(async () => chat.sendMessage("Choose an approach"));
  await act(async () => {
    streamOptions.onToolResult?.({
      name: "concept_note_ask_question",
      options: ["Detailed", "Brief"],
    });
    streamOptions.onError?.("Connection lost", undefined, {
      streamStarted: true,
    });
  });
  expect(chat.messages).toEqual([
    expect.objectContaining({ role: "user", text: "Choose an approach" }),
  ]);
});

it("removes choices from a stream interrupted by cancellation", async () => {
  startStream.mockImplementationOnce(async () => {
    streamOptions.onMessage?.("Which approach?");
    streamOptions.onToolResult?.({
      name: "concept_note_ask_question",
      options: ["Detailed", "Brief"],
    });
    throw Object.assign(new Error("Cancelled"), { name: "AbortError" });
  });
  await act(async () => chat.sendMessage("Help me choose the next step"));
  expect(chat.messages.at(-1)).toMatchObject({ text: "Which approach?" });
  expect(chat.messages.at(-1)?.choices).toBeUndefined();
  expect(chat.isGenerating).toBe(false);
});

it("clears a failed overview when Clima reports it has already been posted", async () => {
  await act(async () => chat.requestDraftOverview());
  await act(async () =>
    streamOptions.onError?.("failed", undefined, { streamStarted: true }),
  );
  await act(async () => chat.retry());
  await act(async () =>
    streamOptions.onError?.(
      "already posted",
      "concept_note_draft_overview_unavailable",
      {
        status: 409,
        streamStarted: false,
      },
    ),
  );

  expect(chat.connection).toBe("connected");
  expect(chat.error).toBeNull();
  expect(chat.canRetry).toBe(false);
  expect(chat.overviewFailed).toBe(false);
  expect(refreshDraft).toHaveBeenCalledTimes(1);
  await act(async () => chat.retry());
  expect(startStream).toHaveBeenCalledTimes(2);
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

it("attaches a rendered visual once to the reply, even without text", async () => {
  await act(async () => chat.sendMessage("Chart the emissions"));
  // The done event's merged tool payload; re-reporting it must not duplicate.
  const toolResult = {
    name: "concept_note_render_visual",
    status: "success",
    tool_call_id: "call-1",
    // The HTML arrives only in the call arguments, not in the result.
    arguments: { title: "Emissions", html: "<svg></svg>" },
    action: "concept_note.visual.render",
    success: true,
    data: { title: "Emissions", html_chars: 11 },
    error_code: null,
  };
  await act(async () => {
    streamOptions.onToolResult?.(toolResult);
    streamOptions.onToolResult?.(toolResult);
    streamOptions.onToolResult?.({
      ...toolResult,
      arguments: { title: "Failed", html: "<p></p>" },
      success: false,
      data: null,
    });
    streamOptions.onComplete?.();
  });

  expect(chat.messages.at(-1)).toMatchObject({
    role: "assistant",
    text: "",
    visuals: [{ title: "Emissions", html: "<svg></svg>" }],
  });
  expect(chat.messages.at(-1)?.visuals).toHaveLength(1);
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

it("starts the drafting overview once and attaches its choices", async () => {
  await act(async () => {
    void chat.requestDraftOverview();
    void chat.requestDraftOverview();
  });
  expect(startStream).toHaveBeenCalledTimes(1);
  expect(lastRequestBody().options).toEqual({
    concept_note_turn: "draft_overview",
  });
  expect(chat.messages.some((message) => message.role === "user")).toBe(false);
  await act(async () => {
    streamOptions.onMessage?.("Where should we start?");
    streamOptions.onToolResult?.({
      name: "concept_note_ask_question",
      options: ["Budget", "Scope"],
    });
    streamOptions.onComplete?.();
  });
  expect(chat.messages.at(-1)).toMatchObject({
    role: "assistant",
    text: "Where should we start?",
    choices: ["Budget", "Scope"],
  });
});

it("binds live choices to the saved question without remounting the card", async () => {
  await act(async () => chat.sendMessage("Help me choose"));
  const localId = chat.messages.at(-1)!.id;
  await act(async () => {
    streamOptions.onToolResult?.({
      name: "concept_note_ask_question",
      options: ["Budget", "Partners"],
    });
    streamOptions.onComplete?.({
      ok: true,
      history_saved: true,
      assistant_message_id: "saved-question",
    });
  });
  expect(chat.messages.at(-1)).toMatchObject({
    id: localId,
    questionMessageId: "saved-question",
    choices: ["Budget", "Partners"],
  });
  await act(async () =>
    chat.sendMessage("Budget", undefined, "saved-question"),
  );
  expect(lastRequestBody()).toMatchObject({
    context: { concept_note_question_message_id: "saved-question" },
  });
});

it("discards unsaved live options rather than allowing an unbound reply", async () => {
  await act(async () => chat.sendMessage("Help me choose"));
  await act(async () => {
    streamOptions.onToolResult?.({
      name: "concept_note_ask_question",
      options: ["Budget", "Partners"],
    });
    streamOptions.onComplete?.({
      ok: true,
      history_saved: false,
      assistant_message_id: null,
    });
  });
  expect(chat.messages.at(-1)?.choices).toBeUndefined();
  expect(chat.messages.at(-1)?.questionMessageId).toBeUndefined();
});

it("explains an inactive chat, removes the unsent answer and refreshes the chat list", async () => {
  startStream.mockImplementationOnce(async () =>
    streamOptions.onError?.("conflict", "concept_note_thread_mismatch", {
      status: 409,
      streamStarted: false,
    }),
  );
  let completed: boolean | undefined;
  await act(async () => {
    completed = await chat.sendMessage("Use quarters", undefined, "question");
  });

  expect(completed).toBe(false);
  expect(chat.error).toBe("chat-thread-inactive");
  expect(chat.canRetry).toBe(false);
  expect(chat.connection).toBe("connected");
  expect(chat.messages.some((message) => message.role === "user")).toBe(false);
  expect(threadInactive).toHaveBeenCalledTimes(1);
});

it("replaces the unsaved partial reply when Retry starts", async () => {
  await act(async () => chat.sendMessage("Explain the timeline"));
  await act(async () => {
    streamOptions.onMessage?.("Quarters suit a five-year");
    streamOptions.onError?.("failed", undefined, { streamStarted: true });
  });
  const assistantTexts = () =>
    chat.messages
      .filter((message) => message.role === "assistant")
      .map((message) => message.text);
  expect(assistantTexts()).toEqual(["Quarters suit a five-year"]);

  await act(async () => chat.retry());
  await act(async () => {
    streamOptions.onMessage?.("Quarters suit a five-year programme.");
    streamOptions.onComplete?.({ ok: true, history_saved: true });
  });

  expect(assistantTexts()).toEqual(["Quarters suit a five-year programme."]);
  expect(
    chat.messages.filter((message) => message.role === "user"),
  ).toHaveLength(1);
});

async function remountWithHistory(messages: unknown[]) {
  await act(async () => root.unmount());
  historyMessages = messages;
  root = createRoot(document.createElement("div"));
  await act(async () => root.render(<Harness />));
}

it("marks an answer that never reached Clima as not sent, then sends it on Retry", async () => {
  await act(async () => chat.sendMessage("Budget"));
  // No response at all: the request did not reach the service.
  await act(async () =>
    streamOptions.onError?.("Failed to fetch", undefined, {
      streamStarted: false,
    }),
  );
  const answer = chat.messages.find((message) => message.role === "user");
  expect(answer?.unsent).toBe(true);
  expect(chat.canRetry).toBe(true);

  await act(async () => chat.retry());
  expect(lastRequestBody()).toMatchObject({
    content: "Budget",
    options: { concept_note_turn: "retry" },
  });
  expect(chat.messages.find((message) => message.role === "user")?.unsent).toBe(
    false,
  );
});

it("replaces an unsent answer when the user answers again instead", async () => {
  await act(async () => chat.sendMessage("Budget"));
  await act(async () =>
    streamOptions.onError?.("Failed to fetch", undefined, {
      streamStarted: false,
    }),
  );
  await act(async () => chat.sendMessage("Partners"));
  expect(
    chat.messages
      .filter((message) => message.role === "user")
      .map((message) => message.text),
  ).toEqual(["Partners"]);
});

it("keeps server failures as sent: Clima may already have saved them", async () => {
  await act(async () => chat.sendMessage("Budget"));
  await act(async () =>
    streamOptions.onError?.("Bad gateway", undefined, {
      status: 502,
      streamStarted: false,
    }),
  );
  expect(
    chat.messages.find((message) => message.role === "user")?.unsent,
  ).toBeUndefined();
});

it("offers Retry when the last saved message has no reply", async () => {
  await remountWithHistory([
    {
      message_id: "card",
      role: "assistant",
      text: "Which format?",
      choices: ["Table", "Bullets"],
    },
    { message_id: "answer", role: "user", text: "Table" },
  ]);
  expect(chat.error).toBe("chat-reply-missing");
  // The connection itself is fine; only this turn is unfinished.
  expect(chat.connection).toBe("connected");
  expect(chat.canRetry).toBe(true);

  await act(async () => chat.retry());
  expect(lastRequestBody()).toMatchObject({
    content: "Table",
    context: { concept_note_question_message_id: "card" },
    options: { concept_note_turn: "retry" },
  });
  // Retry repeats the saved message instead of adding a second bubble.
  expect(
    chat.messages.filter((message) => message.role === "user"),
  ).toHaveLength(1);
});

it("does not offer Retry when the last message is Clima's", async () => {
  await remountWithHistory([
    { message_id: "q", role: "user", text: "Hello" },
    { message_id: "a", role: "assistant", text: "Hi" },
  ]);
  expect(chat.error).toBeNull();
  expect(chat.canRetry).toBe(false);
});

it("waits for an active saved reply and loads it without starting another stream", async () => {
  jest.useFakeTimers();
  historyReplyInProgress = true;
  await remountWithHistory([{ message_id: "q", role: "user", text: "Budget" }]);
  expect(chat.replyStatus).toBe("chat-reply-in-progress");
  expect(chat.error).toBeNull();
  expect(chat.canRetry).toBe(false);

  await act(async () => {
    await chat.sendMessage("Duplicate");
    await chat.requestDraftOverview();
    await chat.retry();
  });
  expect(startStream).not.toHaveBeenCalled();

  historyReplyInProgress = false;
  historyMessages.push({
    message_id: "a",
    role: "assistant",
    text: "About 2M EUR.",
  });
  await act(async () => {
    await jest.advanceTimersByTimeAsync(3_000);
  });
  expect(chat.messages.map(({ id }) => id)).toEqual(["q", "a"]);
  expect(chat.replyStatus).toBeNull();
  expect(chat.error).toBeNull();
  expect(observedReplyEnd).toHaveBeenCalledTimes(1);
  const calls = jest.mocked(fetch).mock.calls.length;
  await act(async () => {
    await jest.advanceTimersByTimeAsync(9_000);
  });
  expect(fetch).toHaveBeenCalledTimes(calls);
});

it("refreshes after an overlapping send is rejected and offers Retry only when idle", async () => {
  jest.useFakeTimers();
  await act(async () => chat.sendMessage("Duplicate"));
  historyMessages = [
    { message_id: "q", role: "user", text: "Accepted elsewhere" },
  ];
  historyReplyInProgress = true;
  await act(async () =>
    streamOptions.onError?.(
      "Clima is still replying.",
      "concept_note_reply_in_progress",
      { status: 409, streamStarted: false },
    ),
  );
  expect(chat.messages.map(({ id }) => id)).toEqual(["q"]);
  expect(chat.replyStatus).toBe("chat-reply-in-progress");
  expect(chat.error).toBeNull();
  expect(chat.canRetry).toBe(false);

  historyReplyInProgress = false;
  await act(async () => {
    await jest.advanceTimersByTimeAsync(3_000);
  });
  expect(chat.replyStatus).toBeNull();
  expect(chat.error).toBe("chat-reply-missing");
  expect(chat.canRetry).toBe(true);
});

it("reconciles a disconnected stream with its completed reply without resending", async () => {
  await act(async () => chat.sendMessage("Budget"));
  historyMessages = [
    { message_id: "q", role: "user", text: "Budget" },
    { message_id: "a", role: "assistant", text: "About 2M EUR." },
  ];
  await act(async () =>
    streamOptions.onError?.("Disconnected", undefined, {
      streamStarted: true,
      interrupted: true,
    }),
  );
  expect(chat.messages.map(({ id }) => id)).toEqual(["q", "a"]);
  expect(chat.canRetry).toBe(false);
  expect(startStream).toHaveBeenCalledTimes(1);
});
