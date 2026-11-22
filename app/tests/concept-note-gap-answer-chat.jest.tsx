/** @jest-environment jsdom */

// The chat side of the gap form: how a sent gap answer reads in the chat
// (live and from saved history), where focus goes when the form closes, why
// a held send is disabled, and the scroll padding under the form's footer.
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
import { ChakraProvider, defaultSystem } from "@chakra-ui/react";
import { act, useState, type ComponentProps } from "react";
import { createRoot, type Root } from "react-dom/client";
import { LuInfo } from "react-icons/lu";
import { createInstance } from "i18next";
import translations from "@/i18n/locales/en/concept-notes.json";
import {
  GAP_ANSWER_HISTORY_KEYS,
  GAP_ANSWER_REQUEST_KEYS,
  GAP_ANSWER_SLOTS,
  legacyGapAnswerTemplate,
  readConceptNoteThreadMessages,
  readGapAnswerMessage,
  type ConceptNoteChatMessage,
} from "@/components/ConceptNoteWorkspace/chat-utils";
import type { ConceptNoteContextPresentation } from "@/components/ConceptNoteWorkspace/context-status";
import type { EditController } from "@/components/ConceptNoteWorkspace/document-review";
import type {
  GapAnswerForm as GapAnswerFormType,
  GapAnswerRequest,
} from "@/components/ConceptNoteWorkspace/gap-answer-form";
import {
  EDIT_INSTRUCTION_MAX_CHARS,
  type EditScope,
} from "@/util/concept-note-edit-types";

// Real English strings, so the bubble is checked as users read it.
const i18n = createInstance();
const t = (key: string, values?: Record<string, unknown>) =>
  i18n.t(key, values);
jest.unstable_mockModule("@/i18n/client", () => ({
  useTranslation: () => ({ t }),
}));

// Chat state the mocked hook starts from; sendMessage appends the trimmed
// content as the user's message, like the real hook's optimistic message.
let history: ConceptNoteChatMessage[] = [];
let isGenerating = false;
let historyLoading = false;
const sent: [string, EditScope | undefined][] = [];
jest.unstable_mockModule(
  "@/components/ConceptNoteWorkspace/use-concept-note-chat",
  () => ({
    useConceptNoteChat: () => {
      const [messages, setMessages] = useState(history);
      return {
        connection: "connected",
        error: null,
        canRetry: false,
        overviewFailed: false,
        retry: jest.fn(),
        historyLoading,
        isGenerating,
        progress: null,
        reasoning: [],
        messages,
        sendMessage: async (content: string, scope?: EditScope) => {
          sent.push([content, scope]);
          setMessages((current) => [
            ...current,
            {
              id: `sent-${current.length}`,
              role: "user",
              text: content.trim(),
            },
          ]);
        },
        requestDraftOverview: jest.fn(),
      };
    },
  }),
);
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

type GapAnswerFormProps = ComponentProps<typeof GapAnswerFormType>;
const formProps: GapAnswerFormProps[] = [];
let ConceptNoteChatPanel: typeof import("@/components/ConceptNoteWorkspace/chat-panel").ConceptNoteChatPanel;
let root: Root;
let container: HTMLDivElement;
const closeGap = jest.fn();
const fetchQuestion = jest.fn<typeof fetch>();
const originalFetch = globalThis.fetch;
const originalResizeObserver = globalThis.ResizeObserver;
const originalScrollIntoView = HTMLElement.prototype.scrollIntoView;
const originalScrollTo = HTMLElement.prototype.scrollTo;
const originalCSS = globalThis.CSS;
const originalStructuredClone = globalThis.structuredClone;

const readyStatus = {
  state: "ready",
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
const gapAnswer: GapAnswerRequest = {
  chapterId: "financing-chapter",
  chapterTitle: 'Financing plan "A"',
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
      suggestions: [],
      source_refs: [],
      version: 1,
      resolution: null,
      created_at: "2026-10-15T00:00:00Z",
      updated_at: "2026-10-15T00:00:00Z",
    },
  },
};

// A marker with no gap record: its partial answers still go to the chat. A
// recorded gap saves partial answers on the gap instead (see the composer tests).
const legacyGapAnswer: GapAnswerRequest = {
  ...gapAnswer,
  row: { ...gapAnswer.row, gap: null },
};

beforeAll(async () => {
  await i18n.init({
    lng: "en",
    resources: { en: { translation: translations } },
  });
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  HTMLElement.prototype.scrollIntoView = jest.fn();
  HTMLElement.prototype.scrollTo = jest.fn() as never;
  globalThis.CSS = { ...originalCSS, escape: (value: string) => value };
  globalThis.structuredClone = (value) =>
    value === undefined ? value : JSON.parse(JSON.stringify(value));
  // Report every observed element at once, as a first layout would.
  globalThis.ResizeObserver = class {
    constructor(private callback: ResizeObserverCallback) {}
    disconnect() {}
    observe(target: Element) {
      this.callback(
        [{ target } as ResizeObserverEntry],
        this as unknown as ResizeObserver,
      );
    }
    unobserve() {}
  };
  // Record the props the panel passes while rendering the real form.
  const { GapAnswerForm } =
    await import("@/components/ConceptNoteWorkspace/gap-answer-form");
  jest.unstable_mockModule(
    "@/components/ConceptNoteWorkspace/gap-answer-form",
    () => ({
      GapAnswerForm: (props: GapAnswerFormProps) => {
        formProps.push(props);
        return <GapAnswerForm {...props} />;
      },
    }),
  );
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
  history = [];
  isGenerating = false;
  historyLoading = false;
  sent.length = 0;
  formProps.length = 0;
  sessionStorage.clear();
  // Like the workspace, closing the gap unmounts the form in the same update.
  closeGap.mockImplementation(() => root.render(panel(null)));
  globalThis.fetch = fetchQuestion;
  fetchQuestion.mockResolvedValue({
    ok: true,
    json: async () => ({
      why_asking: "Choose the support needed.",
      questions: [
        {
          question: "Which financing instrument?",
          options: ["Loan", "Grant"],
        },
        { question: "What amount?", options: [] },
      ],
    }),
  } as Response);
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  globalThis.fetch = originalFetch;
});

function panel(
  gap: GapAnswerRequest | null,
  status = readyStatus,
  threadId: string | null = "thread",
) {
  return (
    <ChakraProvider value={defaultSystem}>
      <ConceptNoteChatPanel
        cityId="city"
        contextStatus={status}
        composerRequest={null}
        gapAnswer={gap}
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
    </ChakraProvider>
  );
}

async function render(
  gap: GapAnswerRequest | null,
  status = readyStatus,
  threadId: string | null = "thread",
): Promise<void> {
  await act(async () => root.render(panel(gap, status, threadId)));
  // The form asks for its questions after a short debounce.
  if (gap)
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 250));
    });
}

const byTestId = <T extends HTMLElement = HTMLElement>(id: string) =>
  container.querySelector<T>(`[data-testid="${id}"]`);
const buttonByText = (text: string) =>
  [...container.querySelectorAll("button")].find(
    (button) => button.textContent === text,
  )!;
const subQuestion = (index: number) =>
  container.querySelectorAll<HTMLElement>(
    '[data-testid="concept-note-gap-subquestion"]',
  )[index];

async function writeAnswer(index: number, value: string): Promise<void> {
  const field = subQuestion(index).querySelector<HTMLTextAreaElement>(
    '[data-testid="concept-note-gap-custom-answer"]',
  )!;
  const setValue = Object.getOwnPropertyDescriptor(
    HTMLTextAreaElement.prototype,
    "value",
  )!.set!;
  await act(async () => {
    setValue.call(field, value);
    field.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

/** Answers the form partly (one question) or completely, then sends it. */
async function sendGapAnswer(
  complete: boolean,
  request: GapAnswerRequest = gapAnswer,
): Promise<string> {
  await render(request);
  await act(async () =>
    subQuestion(0)
      .querySelector<HTMLInputElement>('input[type="radio"][value="0"]')!
      .click(),
  );
  if (complete) await writeAnswer(1, "EUR 2 million\nfrom the city budget");
  await act(async () => byTestId("concept-note-gap-preview")!.click());
  expect(sent).toHaveLength(1);
  return sent[0][0];
}

/** What the user sees in a gap-answer bubble: heading, answers and toggle. */
function visibleBubble(bubble: HTMLElement) {
  const [heading, answers] = bubble.querySelectorAll("p");
  const toggle = bubble.querySelector("button")!;
  const request = document.getElementById(
    toggle.getAttribute("aria-controls")!,
  )!;
  return {
    heading: heading.textContent,
    answers: answers.textContent,
    toggle: toggle.textContent,
    expanded: toggle.getAttribute("aria-expanded"),
    requestHidden: request.hidden,
    request: request.textContent,
  };
}

/** The end of the neutral request every open gap sends, complete or not. */
const NEUTRAL_REQUEST_TAIL =
  "Add the supported facts and keep a marker for any part still missing. Wait for my acceptance before applying.";

describe("a sent gap answer in the chat", () => {
  it("uses a neutral bound request for both partial and complete answers", async () => {
    const partial = await sendGapAnswer(false);
    expect(partial).toContain(NEUTRAL_REQUEST_TAIL);
    expect(partial).not.toContain("replaces its complete");
    expect(partial).not.toContain("[Information needed:");
    sent.length = 0;
    const complete = await sendGapAnswer(true);
    expect(complete).toContain(NEUTRAL_REQUEST_TAIL);
    expect(complete).not.toContain("replaces its complete");
    expect(complete).not.toContain("[Information needed:");
  });

  it("renders older complete requests as answer cards", async () => {
    const values = {
      chapter: "Financing plan",
      question: "What is the requested instrument?",
      marker: "[Information needed: What is the requested instrument?]",
      answer: "1. Which financing instrument?\nLoan",
      interpolation: { escapeValue: false },
    };
    history = [
      {
        id: "old-complete",
        role: "user",
        text: t("gap-answer-complete-request", values),
      },
      {
        id: "old-neutral",
        role: "user",
        text: t("gap-answer-request-history", values),
      },
    ];
    await render(null);
    const cards = container.querySelectorAll(
      '[data-testid="concept-note-gap-answer-message"]',
    );
    expect(cards).toHaveLength(2);
    expect(cards[0].textContent).toContain("1. Which financing instrument?");
    expect(cards[1].textContent).toContain("1. Which financing instrument?");
  });

  it("keeps the request within the limit when the displayed question is over 2,000 characters", async () => {
    const longQuestion = "Describe the financing source and amount. ".repeat(
      60,
    );
    const longGap: GapAnswerRequest = {
      ...gapAnswer,
      row: {
        ...gapAnswer.row,
        question: longQuestion,
        gap: { ...gapAnswer.row.gap!, question: longQuestion },
      },
    };
    await render(longGap);
    await act(async () =>
      subQuestion(0)
        .querySelector<HTMLInputElement>('input[type="radio"][value="0"]')!
        .click(),
    );
    const details = byTestId<HTMLTextAreaElement>("concept-note-gap-details")!;
    // The remaining room is computed from the same shortened question the request sends.
    expect(details.maxLength).toBeGreaterThan(0);
    await act(async () => {
      const setValue = Object.getOwnPropertyDescriptor(
        HTMLTextAreaElement.prototype,
        "value",
      )!.set!;
      setValue.call(details, "x".repeat(details.maxLength));
      details.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => byTestId("concept-note-gap-preview")!.click());
    expect(sent).toHaveLength(1);
    expect(sent[0][0].length).toBeLessThanOrEqual(EDIT_INSTRUCTION_MAX_CHARS);
    expect(sent[0][0]).toContain(`${longQuestion.slice(0, 2000)}…`);
    expect(sent[0][0]).not.toContain(longQuestion.slice(0, 2001));
  });

  it.each([
    {
      complete: false,
      answers: "1. Which financing instrument?\nSelected category: Loan",
      instruction: NEUTRAL_REQUEST_TAIL,
    },
    {
      complete: true,
      answers:
        "1. Which financing instrument?\nSelected category: Loan\n\n2. What amount?\nEUR 2 million\nfrom the city budget",
      instruction: NEUTRAL_REQUEST_TAIL,
    },
  ])(
    "shows the answers, not the instruction (complete: $complete), live and after a reload",
    async ({ complete, answers, instruction }) => {
      const content = await sendGapAnswer(
        complete,
        complete ? gapAnswer : legacyGapAnswer,
      );
      // Clima still receives the whole instruction.
      expect(content).toContain(instruction);
      expect(content).toContain("Wait for my acceptance before applying.");
      // Only a recorded gap binds its answer; a legacy marker has no gap to bind.
      expect(sent[0][1]?.answer_complete).toBe(complete ? true : undefined);

      const live = byTestId("concept-note-gap-answer-message")!;
      expect(visibleBubble(live)).toEqual({
        heading:
          'Answers for Financing plan "A" · What is the requested instrument?',
        answers,
        toggle: "Show request sent to Clima",
        expanded: "false",
        requestHidden: true,
        request: content,
      });
      const shown = visibleBubble(live);
      await act(async () => live.querySelector("button")!.click());
      expect(visibleBubble(live)).toMatchObject({
        toggle: "Hide request sent to Clima",
        expanded: "true",
        requestHidden: false,
      });

      // History returns the same plain text; the bubble reads the same.
      await act(async () => root.unmount());
      root = createRoot(container);
      history = readConceptNoteThreadMessages({
        messages: [{ message_id: "saved", role: "user", text: content }],
      });
      await render(null);
      expect(
        visibleBubble(byTestId("concept-note-gap-answer-message")!),
      ).toEqual(shown);
    },
  );

  it("keeps every other user message as typed", async () => {
    const typed = [
      "Where can I find the total cost?\nThanks",
      // Starts like a gap request but is not one.
      'For the missing information in "Financing plan":\nWhat is it?\n\nMy answer:\nLoan',
    ];
    history = typed.map((text, index) => ({
      id: `typed-${index}`,
      role: "user",
      text,
    }));
    await render(null);
    expect(byTestId("concept-note-gap-answer-message")).toBeNull();
    const paragraphs = [
      ...byTestId("concept-note-chat-scroll")!.querySelectorAll("p"),
    ].map((paragraph) => paragraph.textContent);
    expect(paragraphs).toEqual(expect.arrayContaining(typed));
    expect(container.textContent).not.toContain("Show request sent to Clima");
  });
});

describe("readGapAnswerMessage", () => {
  // Same templates as the chat panel: the current ones, then the older ones, then the complete request as it was sent before it quoted the marker.
  const templates = () => {
    const rendered = [
      ...GAP_ANSWER_REQUEST_KEYS,
      ...GAP_ANSWER_HISTORY_KEYS,
    ].map((key) =>
      t(key, { ...GAP_ANSWER_SLOTS, interpolation: { escapeValue: false } }),
    );
    return [
      ...rendered,
      ...rendered
        .filter((template) => template.includes(GAP_ANSWER_SLOTS.marker))
        .map(legacyGapAnswerTemplate),
    ];
  };
  const request = (
    key: string,
    values: Record<string, string>,
    marker = `[Information needed: ${values.question}]`,
  ) => t(key, { ...values, marker, interpolation: { escapeValue: false } });
  const values = {
    chapter: 'Costs & "risks" (2026)',
    question: "What is the cost?\nInclude VAT [if any].",
    answer: "1. Cost?\nEUR 2 million\n\n$1 & 2 \\ (raw)",
  };

  it("reads chapter, question and answer from both templates", () => {
    for (const key of GAP_ANSWER_REQUEST_KEYS)
      expect(readGapAnswerMessage(request(key, values), templates())).toEqual(
        values,
      );
  });

  it("reads a complete request whose marker is formatted unlike its question", () => {
    const question = "What is the  cost?";
    const marker = "[Information needed: **What is the\ncost**]";
    const text = request(
      "gap-answer-complete-request",
      { ...values, question },
      marker,
    );
    expect(text).toContain(`replaces its complete ${marker} marker`);
    expect(readGapAnswerMessage(text, templates())).toEqual({
      ...values,
      question,
    });
  });

  it("does not read a complete request whose marker is for another question", () => {
    const text = request(
      "gap-answer-complete-request",
      { ...values, question: "What is the cost?" },
      "[Information needed: Who pays?]",
    );
    expect(readGapAnswerMessage(text, templates())).toBeNull();
  });

  it("reads a complete request sent before the marker was quoted", () => {
    const text = request("gap-answer-complete-request", {
      chapter: "Costs",
      question: "What is the cost?",
      answer: "EUR 2 million",
    });
    expect(text).toContain(
      "complete [Information needed: What is the cost?] marker",
    );
    expect(readGapAnswerMessage(text, templates())).toEqual({
      chapter: "Costs",
      question: "What is the cost?",
      answer: "EUR 2 million",
    });
  });

  it("does not read a legacy request whose repeated question differs", () => {
    const text = request("gap-answer-complete-request", {
      chapter: "Costs",
      question: "What is the cost?",
      answer: "EUR 2 million",
    }).replace("[Information needed: What is the cost?]", "[Other]");
    expect(text).toContain("complete [Other] marker");
    expect(readGapAnswerMessage(text, templates())).toBeNull();
    expect(readGapAnswerMessage("Hello", templates())).toBeNull();
  });
});

describe("focus when the gap form closes", () => {
  const composer = () =>
    byTestId<HTMLTextAreaElement>("concept-note-chat-input");

  it.each([
    [
      "Back to conversation",
      () => buttonByText("Back to conversation").click(),
    ],
    ["Save for later", () => buttonByText("Save for later").click()],
    [
      "Escape",
      () =>
        byTestId("concept-note-gap-answer-heading")!.dispatchEvent(
          new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
        ),
    ],
  ])("moves focus to the chat composer after %s", async (_name, close) => {
    await render(gapAnswer);
    await act(async () => close());
    expect(closeGap).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(composer());
  });

  it("moves focus to the chat composer after a send", async () => {
    await sendGapAnswer(true);
    expect(document.activeElement).toBe(composer());
  });

  it("leaves focus alone when no gap form was open", async () => {
    await render(null);
    expect(document.activeElement).toBe(document.body);
  });
});

describe("why Preview is disabled", () => {
  const status = (state: string) =>
    ({
      ...readyStatus,
      state,
      blocked: true,
    }) as ConceptNoteContextPresentation;

  it.each([
    {
      name: "Clima is replying",
      setup: () => (isGenerating = true),
      reason: "Clima is still replying. You can send when it finishes.",
    },
    {
      name: "the history is loading",
      setup: () => (historyLoading = true),
      reason: "Loading the conversation…",
    },
    {
      name: "sources are processing",
      contextStatus: status("processing"),
      reason:
        "Your sources are still processing. You can send when they are ready.",
    },
    {
      name: "sources failed",
      contextStatus: status("failed"),
      reason:
        "Your sources could not be processed. Retry them in the context panel to send.",
    },
    {
      name: "the run has no chat",
      threadId: null,
      reason: "Chat is unavailable for this run",
    },
  ])(
    "passes the reason when $name",
    async ({
      setup,
      contextStatus = readyStatus,
      threadId = "thread",
      reason,
    }) => {
      setup?.();
      await render(gapAnswer, contextStatus, threadId);
      expect(formProps.at(-1)).toMatchObject({
        disabled: true,
        disabledReason: reason,
      });
    },
  );

  it("passes no reason when sending is possible", async () => {
    await render(gapAnswer);
    expect(formProps.at(-1)?.disabled).toBe(false);
    expect(formProps.at(-1)?.disabledReason).toBeUndefined();
  });
});

it("pads the scroll area by the gap form's footer so focus stays above it", async () => {
  const offsetHeight = Object.getOwnPropertyDescriptor(
    HTMLElement.prototype,
    "offsetHeight",
  )!;
  // jsdom has no layout; give the sticky footer the height Chromium measures.
  Object.defineProperty(HTMLElement.prototype, "offsetHeight", {
    configurable: true,
    get(this: HTMLElement) {
      return getComputedStyle(this).position === "sticky" ? 110 : 0;
    },
  });
  try {
    await render(gapAnswer);
    const scroll = byTestId("concept-note-chat-scroll")!;
    // The footer height plus two lines of slack for the focused option row.
    expect(getComputedStyle(scroll).scrollPaddingBottom).toBe("150px");
    await act(async () => buttonByText("Back to conversation").click());
    expect(getComputedStyle(scroll).scrollPaddingBottom).toBe("");
  } finally {
    Object.defineProperty(HTMLElement.prototype, "offsetHeight", offsetHeight);
  }
});
