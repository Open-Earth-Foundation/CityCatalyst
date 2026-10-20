/** @jest-environment jsdom */

import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  expect,
  it,
  jest,
} from "@jest/globals";
import { ChakraProvider, defaultSystem } from "@chakra-ui/react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { LuInfo } from "react-icons/lu";
import { createInstance } from "i18next";
import translations from "@/i18n/locales/en/concept-notes.json";
import type { ConceptNoteContextPresentation } from "@/components/ConceptNoteWorkspace/context-status";
import type { EditController } from "@/components/ConceptNoteWorkspace/document-review";
import type { GapAnswerRequest } from "@/components/ConceptNoteWorkspace/gap-answer-form";
import type { EditScope } from "@/util/concept-note-edit-types";

const sendMessage =
  jest.fn<(content: string, scope?: EditScope) => Promise<void>>();
const closeGap = jest.fn();
let isGenerating = false;
const promptI18n = createInstance();
const t = (key: string, values?: Record<string, unknown>) =>
  key === "gap-answer-request" ? promptI18n.t(key, values) : key;

jest.unstable_mockModule("@/i18n/client", () => ({
  useTranslation: () => ({ t }),
}));
jest.unstable_mockModule(
  "@/components/ConceptNoteWorkspace/use-concept-note-chat",
  () => ({
    useConceptNoteChat: () => ({
      connection: "connected",
      error: null,
      canRetry: false,
      overviewFailed: false,
      retry: jest.fn(),
      historyLoading: false,
      isGenerating,
      progress: null,
      reasoning: "",
      messages: [],
      sendMessage,
      requestDraftOverview: jest.fn(),
    }),
  }),
);
// Composer behavior only; the surrounding chat surfaces are out of scope.
for (const [path, name] of [
  ["chat-suggestions", "ChatSuggestions"],
  ["chat-progress", "ChatProgress"],
  ["drafting-progress-card", "DraftingProgressCard"],
  ["chat-welcome", "ChatWelcome"],
]) {
  jest.unstable_mockModule(`@/components/ConceptNoteWorkspace/${path}`, () => ({
    [name]: () => null,
  }));
}
jest.unstable_mockModule(
  "@/components/ConceptNoteWorkspace/chat-threads",
  () => ({
    ChatThreadSwitcher: () => null,
    OlderChatNotice: () => null,
    useConceptNoteChatThreads: () => ({}),
  }),
);

let ConceptNoteChatPanel: typeof import("@/components/ConceptNoteWorkspace/chat-panel").ConceptNoteChatPanel;
let root: Root;
let container: HTMLDivElement;
const originalResizeObserver = globalThis.ResizeObserver;
const originalStructuredClone = globalThis.structuredClone;
const originalScrollIntoView = HTMLElement.prototype.scrollIntoView;
const originalCSS = globalThis.CSS;
const originalFetch = globalThis.fetch;
const fetchQuestion = jest.fn<typeof fetch>();

const contextStatus = {
  state: "none",
  blocked: false,
  title: "",
  description: "",
  icon: LuInfo,
  actionIcon: LuInfo,
  actionLabel: "",
  color: "content.secondary",
  surface: "base.light",
} as unknown as ConceptNoteContextPresentation;
const edits = {
  error: null,
  loadProposal: jest.fn(),
  refresh: jest.fn(),
} as unknown as EditController;

beforeAll(async () => {
  await promptI18n.init({
    lng: "en",
    resources: { en: { translation: translations } },
  });
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  HTMLElement.prototype.scrollIntoView = jest.fn();
  globalThis.CSS = { ...originalCSS, escape: (value: string) => value };
  globalThis.structuredClone = (value) =>
    value === undefined ? value : JSON.parse(JSON.stringify(value));
  globalThis.ResizeObserver = class {
    disconnect() {}
    observe() {}
    unobserve() {}
  };
  ({ ConceptNoteChatPanel } =
    await import("@/components/ConceptNoteWorkspace/chat-panel"));
});
afterAll(() => {
  HTMLElement.prototype.scrollIntoView = originalScrollIntoView;
  globalThis.CSS = originalCSS;
  globalThis.IS_REACT_ACT_ENVIRONMENT = false;
  globalThis.ResizeObserver = originalResizeObserver;
  globalThis.structuredClone = originalStructuredClone;
});
beforeEach(() => {
  isGenerating = false;
  sendMessage.mockReset();
  closeGap.mockClear();
  sendMessage.mockResolvedValue(undefined);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  globalThis.fetch = originalFetch;
});

async function renderPanel(
  status = contextStatus,
  threadId: string | null = "thread",
  gapAnswer: GapAnswerRequest | null = null,
): Promise<void> {
  await act(async () => {
    root.render(
      <ChakraProvider value={defaultSystem}>
        <ConceptNoteChatPanel
          cityId="city"
          contextStatus={status}
          composerRequest={null}
          gapAnswer={gapAnswer}
          onCloseGap={closeGap}
          onAddGapSource={() => {}}
          draftOverviewPending={false}
          lng="en"
          onOpenContext={() => {}}
          runId="run"
          threadId={threadId}
          editScope={{ kind: "document" } as never}
          edits={edits}
        />
      </ChakraProvider>,
    );
  });
  if (gapAnswer)
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 250));
    });
}

function composer(): HTMLTextAreaElement {
  const element = container.querySelector<HTMLTextAreaElement>(
    '[data-testid="concept-note-chat-input"]',
  );
  expect(element?.tagName).toBe("TEXTAREA");
  return element!;
}

async function type(value: string): Promise<void> {
  const element = composer();
  const setValue = Object.getOwnPropertyDescriptor(
    HTMLTextAreaElement.prototype,
    "value",
  )!.set!;
  await act(async () => {
    setValue.call(element, value);
    element.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

async function pressEnter(shiftKey = false): Promise<KeyboardEvent> {
  const event = new KeyboardEvent("keydown", {
    key: "Enter",
    shiftKey,
    bubbles: true,
    cancelable: true,
  });
  await act(async () => {
    composer().dispatchEvent(event);
  });
  return event;
}

it.each(["uploading", "processing", "preparing"] as const)(
  "allows typing while context is %s, but waits for readiness before sending",
  async (state) => {
    await renderPanel();
    await type("A draft before processing");
    await renderPanel({ ...contextStatus, state, blocked: true });

    expect(composer().disabled).toBe(false);
    expect(composer().value).toBe("A draft before processing");
    expect(composer().placeholder).toBe("chat-input-placeholder");
    expect(composer().getAttribute("aria-describedby")).toBe(
      "concept-note-chat-blocked",
    );
    await type("A draft edited during processing");
    const send = container.querySelector<HTMLButtonElement>(
      '[data-testid="concept-note-chat-send"]',
    )!;
    expect(send.disabled).toBe(true);
    await act(async () => send.click());
    await pressEnter();
    // Submission stays guarded even when the disabled button is bypassed.
    await act(async () => composer().form!.requestSubmit());
    expect(sendMessage).not.toHaveBeenCalled();
    expect(composer().value).toBe("A draft edited during processing");
    expect((await pressEnter(true)).defaultPrevented).toBe(false);

    await renderPanel({ ...contextStatus, state: "ready", blocked: false });
    expect(sendMessage).not.toHaveBeenCalled();
    expect(composer().value).toBe("A draft edited during processing");
    expect(send.disabled).toBe(false);
    await act(async () => send.click());
    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(sendMessage).toHaveBeenCalledWith(
      "A draft edited during processing",
    );
    expect(composer().value).toBe("");
  },
);

it("keeps the composer unavailable when the run has no chat thread", async () => {
  await renderPanel(contextStatus, null);
  expect(composer().disabled).toBe(true);
  expect(composer().placeholder).toBe("chat-unavailable");
});

it("keeps the composer editable while Clima responds but holds the send", async () => {
  isGenerating = true;
  await renderPanel();

  expect(composer().disabled).toBe(false);
  await type("Draft my next question");
  await pressEnter();

  expect(sendMessage).not.toHaveBeenCalled();
  expect(composer().value).toBe("Draft my next question");
  const send = container.querySelector<HTMLButtonElement>(
    '[data-testid="concept-note-chat-send"]',
  );
  expect(send?.disabled).toBe(true);

  // Once the reply finishes, Enter sends the text typed during generation.
  isGenerating = false;
  await renderPanel();
  await pressEnter();

  expect(sendMessage).toHaveBeenCalledWith("Draft my next question");
  expect(composer().value).toBe("");
});

it("adds a new line on Shift+Enter instead of sending", async () => {
  await renderPanel();
  await type("First line");
  await pressEnter(true);

  expect(sendMessage).not.toHaveBeenCalled();

  await type("First line\nSecond line");
  await pressEnter();

  expect(sendMessage).toHaveBeenCalledWith("First line\nSecond line");
});

const gapAnswer: GapAnswerRequest = {
  chapterId: "financing-chapter",
  chapterTitle: "Financing plan",
  row: {
    id: "financing-gap",
    question: "What is the requested instrument?",
    whyAsking: "The funder needs the type of support.",
    severity: "critical",
    gap: {
      gap_id: "financing-gap",
      field_key: "financing_instrument",
      question: "What is the requested instrument?",
      why_asking: "The funder needs the type of support.",
      severity: "critical",
      state: "open",
      suggestions: [
        { value: "Loan", source_refs: ["investment-plan"] },
        { value: "Grant", source_refs: ["grant-application"] },
      ],
      source_refs: ["investment-plan", "grant-application"],
      version: 1,
      resolution: null,
      created_at: "2026-10-15T00:00:00Z",
      updated_at: "2026-10-15T00:00:00Z",
    },
  },
};

beforeEach(() => {
  globalThis.fetch = fetchQuestion;
  fetchQuestion.mockReset();
  fetchQuestion.mockResolvedValue({
    ok: true,
    json: async () => ({
      question: "Which financing instrument?",
      why_asking: "Choose the support needed.",
      options: ["Loan", "Grant", "Guarantee"],
    }),
  } as Response);
});

it("shows generated multiple-choice answers without claiming they are sourced facts", async () => {
  await renderPanel(contextStatus, "thread", gapAnswer);
  expect(container.textContent).toContain("Which financing instrument?");
  expect(container.textContent).toContain("Guarantee");
  expect(container.textContent).toContain("gap-other");
  expect(container.textContent).toContain("gap-not-decided");
  expect(sendMessage).not.toHaveBeenCalled();
  const preview = container.querySelector<HTMLButtonElement>(
    '[data-testid="concept-note-gap-preview"]',
  )!;
  expect(preview.disabled).toBe(true);
  await act(async () =>
    container
      .querySelector<HTMLInputElement>('input[type="radio"][value="0"]')!
      .click(),
  );
  expect(preview.disabled).toBe(false);
  await act(async () => preview.click());
  const [content, scope] = sendMessage.mock.calls[0];
  expect(content).toContain("My answer:\nWhich financing instrument?\nLoan");
  expect(content).toContain('"Financing plan"');
  expect(content).toContain(gapAnswer.row.question);
  expect(content).not.toContain("investment-plan");
  expect(content).not.toContain("grant-application");
  expect(scope).toEqual({
    kind: "auto",
    focused_chapter_id: "financing-chapter",
  });
  expect(closeGap).toHaveBeenCalledTimes(1);
});

it("leaves skipped gaps untouched and accepts a custom answer without claiming a suggestion's source", async () => {
  await renderPanel(contextStatus, "thread", gapAnswer);
  const later = [...container.querySelectorAll("button")].find(
    (button) => button.textContent === "gap-answer-later",
  )!;
  await act(async () => later.click());
  expect(closeGap).toHaveBeenCalledTimes(1);
  expect(sendMessage).not.toHaveBeenCalled();
  await type("A combination of loan and grant");
  await pressEnter();
  expect(sendMessage.mock.calls[0][0]).toContain(
    "A combination of loan and grant",
  );
  expect(sendMessage.mock.calls[0][0]).not.toContain("Source:");
});

it("offers free text for gaps without suggestions and blocks submission while Clima is busy", async () => {
  isGenerating = true;
  fetchQuestion.mockResolvedValue({
    ok: true,
    json: async () => ({
      question: "What amount?",
      why_asking: "Provide the exact amount.",
      options: [],
    }),
  } as Response);
  await renderPanel(contextStatus, "thread", {
    ...gapAnswer,
    row: { ...gapAnswer.row, gap: null },
  });
  expect(container.querySelectorAll('input[type="radio"]')).toHaveLength(2);
  const answer = container.querySelector<HTMLTextAreaElement>(
    '[data-testid="concept-note-gap-custom-answer"]',
  )!;
  const setValue = Object.getOwnPropertyDescriptor(
    HTMLTextAreaElement.prototype,
    "value",
  )!.set!;
  await act(async () => {
    setValue.call(answer, "Loan");
    answer.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await act(async () => answer.form!.requestSubmit());
  expect(sendMessage).not.toHaveBeenCalled();
  isGenerating = false;
  await renderPanel(contextStatus, "thread", {
    ...gapAnswer,
    row: { ...gapAnswer.row, gap: null },
  });
  await act(async () => answer.form!.requestSubmit());
  expect(sendMessage.mock.calls[0][0]).toContain(
    "My answer:\nWhat amount?\nLoan",
  );
});

it("keeps an undecided answer explicit instead of selecting an invented fact", async () => {
  await renderPanel(contextStatus, "thread", gapAnswer);
  await act(async () =>
    container
      .querySelector<HTMLInputElement>('input[value="unknown"]')!
      .click(),
  );
  await act(async () =>
    container
      .querySelector<HTMLButtonElement>(
        '[data-testid="concept-note-gap-preview"]',
      )!
      .click(),
  );
  expect(sendMessage.mock.calls[0][0]).toContain(
    "Which financing instrument?\ngap-not-decided",
  );
  expect(sendMessage.mock.calls[0][0]).toContain(
    "Keep any information I have not supplied marked as missing",
  );
});

it("shows a recoverable error and free text when the question generator fails", async () => {
  fetchQuestion.mockRejectedValue(new Error("offline"));
  await renderPanel(contextStatus, "thread", gapAnswer);
  expect(container.querySelector('[role="alert"]')?.textContent).toContain(
    "gap-question-unavailable",
  );
  expect(
    container.querySelector('[data-testid="concept-note-gap-custom-answer"]'),
  ).not.toBeNull();
  expect(sendMessage).not.toHaveBeenCalled();
});

it("cancels stale generation when another gap is opened", async () => {
  let resolveOld!: (value: Response) => void;
  fetchQuestion.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        resolveOld = resolve;
      }),
  );
  await renderPanel(contextStatus, "thread", gapAnswer);
  const oldSignal = fetchQuestion.mock.calls[0][1]?.signal;
  await renderPanel(contextStatus, "thread", {
    ...gapAnswer,
    row: { ...gapAnswer.row, id: "next-gap" },
  });
  expect(oldSignal?.aborted).toBe(true);
  await act(async () =>
    resolveOld({
      ok: true,
      json: async () => ({
        question: "Stale question?",
        why_asking: "Old",
        options: ["Old", "Outdated"],
      }),
    } as Response),
  );
  expect(container.textContent).toContain("Which financing instrument?");
  expect(container.textContent).not.toContain("Stale question?");
});

it("preserves apostrophes, ampersands and source URLs in the plain-text gap answer", async () => {
  await renderPanel(contextStatus, "thread", gapAnswer);
  const answer =
    "EIB's PPP & financing details: https://www.eib.org/en/projects";
  await type(answer);
  await pressEnter();
  expect(sendMessage.mock.calls[0][0]).toContain(answer);
  expect(sendMessage.mock.calls[0][0]).not.toContain("&#");
});
