/** @jest-environment jsdom */

import { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, jest } from "@jest/globals";
import type { SSEStreamOptions } from "@/hooks/useSSEStream";
import { readConceptNoteProgress } from "@/components/ConceptNoteWorkspace/chat-utils";

let streamOptions: SSEStreamOptions;
const startStream = jest.fn(async () => {});
const stopStream = jest.fn();
const t = (key: string) => key;
jest.unstable_mockModule("@/i18n/client", () => ({
  useTranslation: () => ({ t }),
}));
jest.unstable_mockModule("@/hooks/useSSEStream", () => ({
  useSSEStream: (options: SSEStreamOptions) => {
    streamOptions = options;
    return { startStream, stopStream };
  },
}));

const { useConceptNoteChat } =
  await import("@/components/ConceptNoteWorkspace/use-concept-note-chat");

let chat: ReturnType<typeof useConceptNoteChat>;
let root: Root;
const originalFetch = globalThis.fetch;
function Harness() {
  const current = useConceptNoteChat({
    lng: "en",
    runId: "run",
    threadId: "thread",
  });
  useEffect(() => {
    chat = current;
  });
  return null;
}
beforeEach(async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  globalThis.fetch = jest.fn(async () => ({
    ok: true,
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

it("keeps operational progress separate from the answer and resets for the next turn", async () => {
  await act(async () => chat.sendMessage("Use digits"));
  await act(async () => streamOptions.onProgress?.({ stage: "preparing" }));
  expect(chat.progress).toEqual([{ stage: "preparing" }]);
  await act(async () =>
    streamOptions.onProgress?.({
      stage: "planning",
      chapter_title: "Budget",
      completed: 0,
      total: 12,
    }),
  );
  expect(chat.isGenerating).toBe(true);
  expect(chat.progress.at(-1)?.chapterTitle).toBe("Budget");
  expect(chat.messages.at(-1)?.text).toBe("");
  await act(async () => streamOptions.onMessage?.("Ready", 0));
  expect(chat.progress.at(-1)?.stage).toBe("responding");
  expect(chat.messages.at(-1)?.text).toBe("Ready");
  await act(async () => streamOptions.onComplete?.());
  expect(chat.isGenerating).toBe(false);
  await act(async () => streamOptions.onProgress?.({ stage: "validating" }));
  expect(chat.progress.at(-1)?.stage).toBe("responding");
  await act(async () => chat.sendMessage("Another edit"));
  expect(chat.progress).toEqual([{ stage: "preparing" }]);
  await act(async () => streamOptions.onError?.("Failed"));
  expect(chat.isGenerating).toBe(false);
  expect(chat.error).toBe("chat-send-error");
  expect(chat.messages.at(-1)?.role).toBe("user");
});

it("ignores unknown stages and never copies arbitrary reasoning or prompts", () => {
  expect(
    readConceptNoteProgress({ stage: "reasoning", text: "private" }),
  ).toBeNull();
  const progress = readConceptNoteProgress({
    stage: "planning",
    chapter_title: "Budget",
    reasoning: "private",
    prompt: "private",
    completed: -1,
    total: "12",
  });
  expect(progress).toEqual({
    stage: "planning",
    chapterTitle: "Budget",
    completed: undefined,
    total: undefined,
  });
});

it("groups live summaries and clears them on completion and failure", async () => {
  await act(async () => chat.sendMessage("Edit the draft"));
  await act(async () => {
    streamOptions.onReasoning?.({
      id: "plan",
      stage: "planning",
      chapter_title: "Budget",
      delta: "Checking ",
    });
    streamOptions.onReasoning?.({
      id: "review",
      stage: "reviewing",
      chapter_title: "Timeline",
      delta: "Reviewing dates.",
    });
    streamOptions.onReasoning?.({
      id: "plan",
      stage: "planning",
      chapter_title: "Budget",
      delta: "the amount.",
    });
  });
  expect(chat.reasoning.map((item) => item.text)).toEqual([
    "Reviewing dates.",
    "Checking the amount.",
  ]);
  expect(chat.messages.at(-1)?.text).toBe("");
  await act(async () => {
    streamOptions.onReasoning?.({
      id: "source",
      stage: "reading",
      delta: "Partial",
    });
    streamOptions.onReasoning?.({
      id: "source",
      stage: "reading",
      delta: "Complete source summary",
      replace: true,
    });
  });
  expect(chat.reasoning.at(-1)?.text).toBe("Complete source summary");
  await act(async () => streamOptions.onError?.("Failed"));
  expect(chat.isGenerating).toBe(false);
  expect(chat.reasoning).toEqual([]);
  await act(async () => chat.sendMessage("Try again"));
  expect(chat.reasoning).toEqual([]);
  await act(async () =>
    streamOptions.onReasoning?.({
      id: "new",
      stage: "chat",
      delta: "Considering the request.",
    }),
  );
  expect(chat.reasoning).toHaveLength(1);
  await act(async () => streamOptions.onComplete?.());
  expect(chat.reasoning).toEqual([]);
});
