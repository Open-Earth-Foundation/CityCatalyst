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
import type { ConceptNoteChatMessage } from "@/components/ConceptNoteWorkspace/chat-utils";

const sendMessage =
  jest.fn<
    (
      content: string,
      scope?: EditScope,
      questionMessageId?: string,
    ) => Promise<void | boolean>
  >();
const closeGap = jest.fn();
let isGenerating = false;
let messages: ConceptNoteChatMessage[] = [];
const promptI18n = createInstance();
const t = (key: string, values?: Record<string, unknown>) =>
  key === "gap-answer-request" || key === "gap-answer-complete-request"
    ? promptI18n.t(key, values)
    : key;

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
      messages,
      sendMessage,
      requestDraftOverview: jest.fn(),
    }),
  }),
);
// Composer behavior only; the surrounding chat surfaces are out of scope.
for (const [path, name] of [
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
const originalScrollTo = HTMLElement.prototype.scrollTo;
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
  HTMLElement.prototype.scrollTo = jest.fn();
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
  HTMLElement.prototype.scrollTo = originalScrollTo;
  globalThis.CSS = originalCSS;
  globalThis.IS_REACT_ACT_ENVIRONMENT = false;
  globalThis.ResizeObserver = originalResizeObserver;
  globalThis.structuredClone = originalStructuredClone;
});
beforeEach(() => {
  isGenerating = false;
  messages = [];
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
  composerRequest: { id: string; content: string } | null = null,
): Promise<void> {
  await act(async () => {
    root.render(
      <ChakraProvider value={defaultSystem}>
        <ConceptNoteChatPanel
          cityId="city"
          contextStatus={status}
          composerRequest={composerRequest}
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
  sessionStorage.clear();
  globalThis.fetch = fetchQuestion;
  fetchQuestion.mockReset();
  fetchQuestion.mockResolvedValue({
    ok: true,
    json: async () => ({
      why_asking: "Choose the support needed.",
      questions: [
        {
          question: "Which financing instrument?",
          options: ["Loan", "Grant", "Guarantee"],
        },
        { question: "What amount?", options: [] },
      ],
    }),
  } as Response);
});

const subQuestion = (index: number) =>
  container.querySelectorAll<HTMLElement>(
    '[data-testid="concept-note-gap-subquestion"]',
  )[index];

async function writeAnswer(index: number, value: string) {
  const answer = subQuestion(index).querySelector<HTMLTextAreaElement>(
    '[data-testid="concept-note-gap-custom-answer"]',
  )!;
  const setValue = Object.getOwnPropertyDescriptor(
    HTMLTextAreaElement.prototype,
    "value",
  )!.set!;
  await act(async () => {
    setValue.call(answer, value);
    answer.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

const previewButton = () =>
  container.querySelector<HTMLButtonElement>(
    '[data-testid="concept-note-gap-preview"]',
  )!;

it("shows generated multiple-choice answers without claiming they are sourced facts", async () => {
  await renderPanel(contextStatus, "thread", gapAnswer);
  expect(fetchQuestion.mock.calls[0][0]).toBe(
    "/api/v1/concept-notes/run/gap-question/",
  );
  expect(subQuestion(0).textContent).toContain("1Which financing instrument?");
  expect(subQuestion(1).textContent).toContain("2What amount?");
  // The long gap request is collapsible context, not the heading.
  expect(container.textContent).toContain("gap-questions-heading");
  expect(
    container.querySelector('[data-testid="concept-note-gap-question"]')
      ?.textContent,
  ).toBe(gapAnswer.row.question);
  expect(container.textContent).toContain("Guarantee");
  expect(container.textContent).toContain("gap-other");
  expect(container.textContent).toContain("gap-not-decided");
  expect(sendMessage).not.toHaveBeenCalled();
  const preview = previewButton();
  expect(preview.disabled).toBe(true);
  await act(async () =>
    subQuestion(0)
      .querySelector<HTMLInputElement>('input[type="radio"][value="0"]')!
      .click(),
  );
  expect(preview.disabled).toBe(false);
  expect(container.textContent).toContain("gap-acceptance-hint");
  await act(async () => preview.click());
  const [content, scope] = sendMessage.mock.calls[0];
  // A partial answer keeps the gap's marker, so the gap stays open.
  expect(content).toContain(
    "My answer:\n1. Which financing instrument?\nLoan\n\n2. What amount?\ngap-not-decided",
  );
  expect(content).toContain(
    "Keep any information I have not supplied marked as missing",
  );
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

it("asks Clima to replace the gap marker once every question is answered", async () => {
  await renderPanel(contextStatus, "thread", gapAnswer);
  await act(async () =>
    subQuestion(0)
      .querySelector<HTMLInputElement>('input[type="radio"][value="custom"]')!
      .click(),
  );
  await writeAnswer(0, "Blended loan and grant");
  await writeAnswer(1, "EUR 2 million");
  expect(container.textContent).toContain("gap-complete-hint");
  await act(async () => previewButton().click());
  const [content] = sendMessage.mock.calls[0];
  expect(content).toContain(
    "My answers:\n1. Which financing instrument?\nBlended loan and grant\n\n2. What amount?\nEUR 2 million",
  );
  expect(content).toContain(
    "[Information needed: What is the requested instrument?]",
  );
  expect(content).not.toContain("marked as missing");
});

it("leaves the gap untouched when answered later and restores the answers on return", async () => {
  await renderPanel(contextStatus, "thread", gapAnswer);
  await act(async () =>
    subQuestion(0)
      .querySelector<HTMLInputElement>('input[type="radio"][value="1"]')!
      .click(),
  );
  await writeAnswer(1, "EUR 2 million");
  const later = [...container.querySelectorAll("button")].find(
    (button) => button.textContent === "gap-answer-later",
  )!;
  await act(async () => later.click());
  expect(closeGap).toHaveBeenCalledTimes(1);
  expect(sendMessage).not.toHaveBeenCalled();

  // Reopening shows the same questions and answers without generating new ones.
  await renderPanel(contextStatus, "thread", null);
  await renderPanel(contextStatus, "thread", gapAnswer);
  expect(fetchQuestion).toHaveBeenCalledTimes(1);
  expect(
    subQuestion(0).querySelector<HTMLInputElement>(
      'input[type="radio"][value="1"]',
    )!.checked,
  ).toBe(true);
  expect(
    subQuestion(1).querySelector<HTMLTextAreaElement>(
      '[data-testid="concept-note-gap-custom-answer"]',
    )!.value,
  ).toBe("EUR 2 million");

  // A sent answer clears the draft, so the next visit starts fresh.
  await act(async () => previewButton().click());
  await renderPanel(contextStatus, "thread", null);
  await renderPanel(contextStatus, "thread", gapAnswer);
  expect(fetchQuestion).toHaveBeenCalledTimes(2);
});

it("offers free text for gaps without suggestions and blocks submission while Clima is busy", async () => {
  isGenerating = true;
  fetchQuestion.mockResolvedValue({
    ok: true,
    json: async () => ({
      why_asking: "Provide the exact amount.",
      questions: [{ question: "What amount?", options: [] }],
    }),
  } as Response);
  const legacy = { ...gapAnswer, row: { ...gapAnswer.row, gap: null } };
  await renderPanel(contextStatus, "thread", legacy);
  expect(container.querySelectorAll('input[type="radio"]')).toHaveLength(2);
  await writeAnswer(0, "Loan");
  const form = previewButton().form!;
  await act(async () => form.requestSubmit());
  expect(sendMessage).not.toHaveBeenCalled();
  isGenerating = false;
  await renderPanel(contextStatus, "thread", legacy);
  await act(async () => form.requestSubmit());
  // A legacy marker has no gap record, which edit validation requires before a
  // marker may be replaced, so even a full answer keeps the marker.
  expect(sendMessage.mock.calls[0][0]).toContain(
    "My answer:\n1. What amount?\nLoan",
  );
  expect(sendMessage.mock.calls[0][0]).not.toContain("[Information needed:");
});

it("falls back to free text on failure and drops it when a retry changes the question", async () => {
  fetchQuestion.mockRejectedValueOnce(new Error("offline"));
  await renderPanel(contextStatus, "thread", gapAnswer);
  expect(container.querySelector('[role="alert"]')?.textContent).toContain(
    "gap-question-unavailable",
  );
  await writeAnswer(0, "Loan");
  // The fallback asks the recorded gap itself, so its answer can close it.
  expect(container.textContent).toContain("gap-complete-hint");
  fetchQuestion.mockResolvedValueOnce({
    ok: true,
    json: async () => ({
      why_asking: "Timing matters.",
      questions: [{ question: "What completion year?", options: [] }],
    }),
  } as Response);
  const retry = [...container.querySelectorAll("button")].find(
    (button) => button.textContent === "gap-retry-question",
  )!;
  await act(async () => retry.click());
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 250));
  });
  expect(subQuestion(0).textContent).toContain("What completion year?");
  expect(
    subQuestion(0).querySelector<HTMLTextAreaElement>(
      '[data-testid="concept-note-gap-custom-answer"]',
    )!.value,
  ).toBe("");
  expect(previewButton().disabled).toBe(true);
});

it("counts down the shared edit limit and stops answers before it is exceeded", async () => {
  fetchQuestion.mockResolvedValue({
    ok: true,
    json: async () => ({
      why_asking: "Several parts are missing.",
      questions: [1, 2, 3, 4].map((part) => ({
        question: `Part ${part}?`,
        options: [],
      })),
    }),
  } as Response);
  await renderPanel(contextStatus, "thread", gapAnswer);
  // The form replaces the chat box, so Preview is its only submit.
  expect(
    container.querySelector('[data-testid="concept-note-chat-input"]'),
  ).toBeNull();
  const field = (index: number) =>
    subQuestion(index).querySelector<HTMLTextAreaElement>(
      '[data-testid="concept-note-gap-custom-answer"]',
    )!;
  const charsLeft = () =>
    container.querySelector('[data-testid="concept-note-gap-chars-left"]');
  for (const index of [0, 1, 2]) await writeAnswer(index, "x".repeat(2000));
  expect(charsLeft()?.textContent).toBe("gap-characters-left");
  // The last field may only take what is left of the shared limit.
  expect(field(3).maxLength).toBeLessThan(2000);
  // Text set past the limit (the browser would refuse to type it) blocks Preview.
  await writeAnswer(3, "x".repeat(2000));
  expect(charsLeft()?.textContent).toBe("gap-characters-full");
  expect(previewButton().disabled).toBe(true);
  await act(async () => previewButton().form!.requestSubmit());
  expect(sendMessage).not.toHaveBeenCalled();
  expect(closeGap).not.toHaveBeenCalled();
  expect(field(3).value).toHaveLength(2000);
});

it("keeps an undecided answer explicit instead of selecting an invented fact", async () => {
  await renderPanel(contextStatus, "thread", gapAnswer);
  await act(async () =>
    subQuestion(0)
      .querySelector<HTMLInputElement>('input[value="unknown"]')!
      .click(),
  );
  // Not decided yet alone is not an answer, so there is nothing to preview.
  expect(previewButton().disabled).toBe(true);
  await writeAnswer(1, "EUR 2 million");
  await act(async () => previewButton().click());
  expect(sendMessage.mock.calls[0][0]).toContain(
    "1. Which financing instrument?\ngap-not-decided",
  );
  expect(sendMessage.mock.calls[0][0]).toContain(
    "Keep any information I have not supplied marked as missing",
  );
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
        why_asking: "Old",
        questions: [
          { question: "Stale question?", options: ["Old", "Outdated"] },
        ],
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
  await writeAnswer(1, answer);
  await act(async () => previewButton().click());
  expect(sendMessage.mock.calls[0][0]).toContain(answer);
  expect(sendMessage.mock.calls[0][0]).not.toContain("&#");
  expect(sendMessage.mock.calls[0][0]).not.toContain("Source:");
});

function choiceQuestion(id = "question"): ConceptNoteChatMessage {
  return {
    id,
    questionMessageId: id,
    role: "assistant",
    text: "Which part should we clarify?",
    choices: ["Budget", "Partners"],
  };
}
async function typeInline(value: string) {
  const element = container.querySelector<HTMLTextAreaElement>(
    '[data-testid="concept-note-chat-choices"] textarea',
  )!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype,
      "value",
    )!.set!.call(element, value);
    element.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
function finishChoiceHistory() {
  messages = [
    choiceQuestion(),
    { id: "answer", role: "user", text: "Budget" },
    choiceQuestion("next-question"),
  ];
}
it("moves an inline draft into the composer when an option is picked instead", async () => {
  messages = [choiceQuestion()];
  await renderPanel();
  await typeInline("  Draft paragraph\nSecond paragraph  ");
  await type("Existing composer draft");
  await act(async () =>
    container.querySelector<HTMLButtonElement>("button[aria-pressed]")!.click(),
  );
  expect(sendMessage).toHaveBeenCalledWith("Budget", undefined, "question");
  // Nothing typed is lost, and nothing extra is sent.
  expect(composer().value).toBe(
    "Existing composer draft\n\nDraft paragraph\nSecond paragraph",
  );
  finishChoiceHistory();
  await renderPanel();
  expect(composer().value).toBe(
    "Existing composer draft\n\nDraft paragraph\nSecond paragraph",
  );
  expect(
    container.querySelector('[data-testid="concept-note-saved-answer-draft"]'),
  ).toBeNull();
  expect(sendMessage).toHaveBeenCalledTimes(1);
});
it("keeps the unsent inline draft when the main composer sends another message", async () => {
  messages = [choiceQuestion()];
  await renderPanel();
  await typeInline("Unsent custom answer");
  await type("A different question");
  await pressEnter();
  finishChoiceHistory();
  await renderPanel();
  expect(composer().value).toBe("");
  expect(
    container.querySelector('[data-testid="concept-note-saved-answer-draft"]')
      ?.textContent,
  ).toContain("Unsent custom answer");
  expect(sendMessage).toHaveBeenCalledTimes(1);
});
it("isolates inline and composer drafts between threads and restores them on return", async () => {
  messages = [choiceQuestion()];
  await renderPanel();
  await typeInline("Thread one inline");
  await type("Thread one composer");
  await renderPanel(contextStatus, "other-thread");
  expect(composer().value).toBe("");
  expect(
    container.querySelector<HTMLTextAreaElement>(
      '[data-testid="concept-note-chat-choices"] textarea',
    )!.value,
  ).toBe("");
  await typeInline("Thread two inline");
  await type("Thread two composer");
  await renderPanel(contextStatus, "thread");
  expect(composer().value).toBe("Thread one composer");
  expect(
    container.querySelector<HTMLTextAreaElement>(
      '[data-testid="concept-note-chat-choices"] textarea',
    )!.value,
  ).toBe("Thread one inline");
  expect(sendMessage).not.toHaveBeenCalled();
});
it("keeps an inline draft recoverable when stale history removes its originating question", async () => {
  messages = [choiceQuestion()];
  sendMessage.mockResolvedValue(false);
  await renderPanel();
  await typeInline("Custom answer from a stale card");
  await act(async () =>
    container
      .querySelector<HTMLButtonElement>('[aria-label="chat-choices-send"]')!
      .click(),
  );
  messages = [choiceQuestion("replacement")];
  await renderPanel();
  expect(
    container.querySelector('[data-testid="concept-note-saved-answer-draft"]')
      ?.textContent,
  ).toContain("Custom answer from a stale card");
  expect(sendMessage).toHaveBeenCalledTimes(1);
});

it("does not reapply an already used composer request when switching threads", async () => {
  const request = { id: "prefill-once", content: "Requested draft" };
  await renderPanel(contextStatus, "thread", null, request);
  await act(async () => {
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => resolve()),
    );
  });
  expect(composer().value).toBe("Requested draft");
  await type("Edited thread one draft");
  await renderPanel(contextStatus, "other-thread", null, request);
  await act(async () => {
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => resolve()),
    );
  });
  expect(composer().value).toBe("");
  await renderPanel(contextStatus, "thread", null, request);
  expect(composer().value).toBe("Edited thread one draft");
  expect(sendMessage).not.toHaveBeenCalled();
});

it("keeps an over-limit composer message, blocks sending and explains the limit", async () => {
  await renderPanel();
  await type("y".repeat(8_010));
  const send = container.querySelector<HTMLButtonElement>(
    '[data-testid="concept-note-chat-send"]',
  )!;

  expect(send.disabled).toBe(true);
  expect(
    container.querySelector("#concept-note-chat-too-long")?.textContent,
  ).toBe("chat-message-too-long");
  expect(composer().getAttribute("aria-describedby")).toBe(
    "concept-note-chat-too-long",
  );
  await act(async () => composer().form!.requestSubmit());
  expect(sendMessage).not.toHaveBeenCalled();
  expect(composer().value).toHaveLength(8_010);
});

it("moves keyboard focus to the composer as soon as a suggested answer is sent", async () => {
  let finish!: (value: boolean) => void;
  sendMessage.mockImplementation(
    () =>
      new Promise<boolean>((resolve) => {
        finish = resolve;
      }),
  );
  messages = [choiceQuestion()];
  await renderPanel();
  const option = container.querySelector<HTMLButtonElement>(
    "button[aria-pressed]",
  )!;
  await act(async () => {
    option.focus();
    option.click();
  });

  // Still streaming: focus must not wait for the reply to finish.
  expect(document.activeElement).toBe(composer());
  await act(async () => finish(true));
});

it("announces a finished suggested-answer question politely", async () => {
  messages = [choiceQuestion()];
  await renderPanel();
  const status = container.querySelector(
    '[data-testid="concept-note-chat-question-announcement"]',
  )!;
  expect(status.getAttribute("aria-live")).toBe("polite");
  expect(status.textContent).toBe("chat-choices-arrived");

  isGenerating = true;
  await renderPanel();
  expect(status.textContent).toBe("");
});
it("keeps a card open when its answer was not sent and labels the answer", async () => {
  messages = [
    choiceQuestion(),
    { id: "answer", role: "user", text: "Budget", unsent: true },
  ];
  await renderPanel();
  expect(
    container.querySelector('[data-testid="concept-note-chat-unsent"]')
      ?.textContent,
  ).toBe("chat-message-unsent");
  const options = container.querySelectorAll<HTMLButtonElement>(
    "button[aria-pressed]",
  );
  // Not selected and still answerable, so the user can choose again.
  expect([...options].map((option) => option.disabled)).toEqual([false, false]);
  expect(options[0].getAttribute("aria-pressed")).toBe("false");
  expect(
    container.querySelector(
      '[data-testid="concept-note-chat-choices"] textarea',
    ),
  ).not.toBeNull();
});
it("says when choosing an answer prepares a proposed change", async () => {
  messages = [{ ...choiceQuestion(), choiceAction: "propose_edit" }];
  await renderPanel();
  const note = container.querySelector(
    '[data-testid="concept-note-chat-choices-proposes-edit"]',
  );
  expect(note?.textContent).toBe("chat-choices-proposes-edit");
  expect(
    container
      .querySelector('[aria-label="chat-choices-label"]')
      ?.getAttribute("aria-describedby"),
  ).toBe(note?.id);
  messages = [choiceQuestion()];
  await renderPanel();
  expect(
    container.querySelector(
      '[data-testid="concept-note-chat-choices-proposes-edit"]',
    ),
  ).toBeNull();
});
