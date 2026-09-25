/** @jest-environment jsdom */

import { act, useEffect } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, jest } from "@jest/globals";
import { ChakraProvider } from "@chakra-ui/react";
import { appTheme } from "@/lib/theme/recipes/app-theme";
import type { SSEStreamOptions } from "@/hooks/useSSEStream";

let streamOptions: SSEStreamOptions;
const startStream = jest.fn(async () => {});
const stopStream = jest.fn();
const refreshDraft = jest.fn();
const refreshAfterSourceReview = jest.fn();
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
const { ChatProgress } =
  await import("@/components/ConceptNoteWorkspace/chat-progress");

let chat: ReturnType<typeof useConceptNoteChat>;
let root: Root;
const originalFetch = globalThis.fetch;
function Harness() {
  const current = useConceptNoteChat({
    lng: "en",
    runId: "run",
    threadId: "thread",
    editScope: { kind: "auto", focused_chapter_id: "budget" },
    onDraftOverviewComplete: refreshDraft,
    onSourceReviewComplete: refreshAfterSourceReview,
  });
  useEffect(() => {
    chat = current;
  });
  return null;
}
beforeEach(async () => {
  refreshDraft.mockClear();
  refreshAfterSourceReview.mockClear();
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  globalThis.structuredClone = (value) => JSON.parse(JSON.stringify(value));
  globalThis.fetch = jest.fn(async () => ({
    ok: true,
    json: async () => ({ messages: [] }),
  })) as unknown as typeof fetch;
  root = createRoot(document.createElement("div"));
  await act(async () => root.render(<Harness />));
});

it("renders verified workflow activity even when the reasoning summary has not changed", async () => {
  const container = document.createElement("div");
  await act(async () => root.unmount());
  root = createRoot(container);
  const renderProgress = (isGenerating: boolean) => (
    <ChakraProvider value={appTheme}>
      <ChatProgress
        lng="en"
        isGenerating={isGenerating}
        reasoning={[
          {
            id: "plan",
            stage: "planning",
            text: "Checking the requested rename.",
          },
        ]}
        progress={{
          stage: "reviewing",
          chapterTitle: "Budget",
          completed: 3,
          total: 12,
        }}
      />
    </ChakraProvider>
  );
  await act(async () => root.render(renderProgress(true)));
  expect(
    container.querySelector('[data-testid="concept-note-workflow-progress"]')
      ?.textContent,
  ).toContain("chat-progress-reviewing");
  expect(
    container.querySelector('[data-testid="concept-note-reasoning-preview"]')
      ?.textContent,
  ).toContain("chat-reasoning");
  await act(async () => root.render(renderProgress(false)));
  expect(container.textContent).toBe("");
});
afterEach(async () => {
  await act(async () => root.unmount());
  globalThis.fetch = originalFetch;
  globalThis.IS_REACT_ACT_ENVIRONMENT = false;
});

it("keeps operational progress separate from the answer and resets for the next turn", async () => {
  await act(async () => chat.sendMessage("Use digits"));
  await act(async () => streamOptions.onProgress?.({ stage: "preparing" }));
  expect(chat.progress).toEqual({ stage: "preparing" });
  await act(async () =>
    streamOptions.onProgress?.({
      stage: "planning",
      chapter_title: "Budget",
      completed: 0,
      total: 12,
    }),
  );
  expect(chat.isGenerating).toBe(true);
  expect(chat.progress?.chapterTitle).toBe("Budget");
  await act(async () =>
    streamOptions.onProgress?.({
      stage: "reasoning",
      text: "invalid progress",
    }),
  );
  expect(chat.progress?.stage).toBe("planning");
  expect(chat.messages.at(-1)?.text).toBe("");
  await act(async () => streamOptions.onMessage?.("Ready", 0));
  expect(chat.progress?.stage).toBe("responding");
  expect(chat.messages.at(-1)?.text).toBe("Ready");
  await act(async () => streamOptions.onComplete?.());
  expect(chat.isGenerating).toBe(false);
  expect(refreshDraft).not.toHaveBeenCalled();
  await act(async () => streamOptions.onProgress?.({ stage: "validating" }));
  expect(chat.progress?.stage).toBe("responding");
  await act(async () => chat.sendMessage("Another edit"));
  expect(chat.progress).toEqual({ stage: "preparing" });
  await act(async () => streamOptions.onError?.("Failed"));
  expect(chat.isGenerating).toBe(false);
  expect(chat.error).toBe("chat-send-error");
  expect(chat.messages.at(-1)?.role).toBe("user");
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

it("requests the drafting overview as a hidden turn with only an assistant reply", async () => {
  startStream.mockClear();
  await act(async () => chat.requestDraftOverview());
  expect(chat.messages.map((message) => message.role)).toEqual(["assistant"]);
  const [, request] = startStream.mock.calls.at(-1) as unknown as [
    string,
    { body: string },
  ];
  const body = JSON.parse(request.body);
  expect(body.options).toEqual({ concept_note_turn: "draft_overview" });
  expect(body.context).toEqual({ concept_note_run_id: "run", ui_locale: "en" });
  expect(chat.progress).toEqual({ stage: "summarizing_draft" });
  await act(async () => streamOptions.onProgress?.({ stage: "preparing" }));
  expect(chat.progress).toEqual({ stage: "summarizing_draft" });
  await act(async () => streamOptions.onMessage?.("Your draft is ready.", 0));
  expect(chat.progress).toEqual({ stage: "summarizing_draft" });
  await act(async () => streamOptions.onComplete?.());
  expect(chat.messages.at(-1)?.text).toBe("Your draft is ready.");
  expect(refreshDraft).toHaveBeenCalledTimes(1);

  // Later user turns use the regular request-based labels again.
  await act(async () => chat.sendMessage("What is missing?"));
  expect(chat.progress).toEqual({ stage: "preparing" });
});

it("drops an already-claimed drafting overview without showing an error", async () => {
  await act(async () => chat.requestDraftOverview());
  await act(async () =>
    streamOptions.onError?.(
      "No finished draft",
      "concept_note_draft_overview_unavailable",
    ),
  );
  expect(chat.messages).toEqual([]);
  expect(chat.error).toBeNull();
  expect(chat.isGenerating).toBe(false);
  expect(refreshDraft).toHaveBeenCalledTimes(1);
});

it("requests the source review as a hidden turn that may propose edits", async () => {
  startStream.mockClear();
  await act(async () => chat.requestSourceReview());
  expect(chat.messages.map((message) => message.role)).toEqual(["assistant"]);
  const [url, request] = startStream.mock.calls.at(-1) as unknown as [
    string,
    { body: string },
  ];
  expect(url).toBe("/api/v1/chat/messages");
  const body = JSON.parse(request.body);
  expect(body.content).toBe("source_review");
  expect(body.options).toEqual({ concept_note_turn: "source_review" });
  expect(body.context).toEqual({
    concept_note_run_id: "run",
    ui_locale: "en",
    concept_note_edit: {
      scope: { kind: "auto", focused_chapter_id: "budget" },
      idempotency_key: expect.any(String),
    },
  });
  expect(chat.progress).toEqual({ stage: "reviewing_sources" });
  await act(async () => streamOptions.onProgress?.({ stage: "preparing" }));
  expect(chat.progress).toEqual({ stage: "reviewing_sources" });
  await act(async () =>
    streamOptions.onMessage?.("The budget file answers one gap.", 0),
  );
  expect(chat.progress).toEqual({ stage: "reviewing_sources" });
  await act(async () => streamOptions.onComplete?.());
  expect(chat.messages.at(-1)?.text).toBe("The budget file answers one gap.");
  expect(refreshAfterSourceReview).toHaveBeenCalledTimes(1);
  expect(refreshDraft).not.toHaveBeenCalled();
});

it("drops an already-run source review without showing an error", async () => {
  await act(async () => chat.requestSourceReview());
  await act(async () =>
    streamOptions.onError?.(
      "Nothing to review",
      "concept_note_source_review_unavailable",
    ),
  );
  expect(chat.messages).toEqual([]);
  expect(chat.error).toBeNull();
  expect(chat.isGenerating).toBe(false);
  expect(refreshAfterSourceReview).toHaveBeenCalledTimes(1);
});

it("reports other source review failures like any failed turn", async () => {
  await act(async () => chat.requestSourceReview());
  await act(async () => streamOptions.onError?.("Failed", "upstream_error"));
  expect(chat.error).toBe("chat-send-error");
  expect(refreshAfterSourceReview).not.toHaveBeenCalled();
});
