/** @jest-environment jsdom */

// The chat side of the gap form: what a sent gap answer sends, and how it
// reads in the chat, live and from saved history.
import {
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";
import { act, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  GAP_ANSWER_REQUEST_KEYS,
  GAP_ANSWER_SLOTS,
  readConceptNoteThreadMessages,
  readGapAnswerMessage,
  type ConceptNoteChatMessage,
} from "@/components/ConceptNoteWorkspace/chat-utils";
import type { GapAnswerRequest } from "@/components/ConceptNoteWorkspace/gap-answer-form";
import type { EditScope } from "@/util/concept-note-edit-types";
import {
  conceptNotesI18n,
  contextPresentation,
  editControllerStub,
  financingGapRequest,
  jsonResponse,
  mockChatPanelSurroundings,
  mockTranslation,
  settle,
  setupDomShims,
  setupTestRoot,
} from "./helpers/concept-note-ui";

// Real English strings, so the bubble is checked as users read it.
const i18n = await conceptNotesI18n();
const t = (key: string, values?: Record<string, unknown>) =>
  i18n.t(key, values);
mockTranslation(t);

// Chat state the mocked hook starts from; sendMessage appends the trimmed
// content as the user's message, like the real hook's optimistic message.
let history: ConceptNoteChatMessage[] = [];
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
        historyLoading: false,
        isGenerating: false,
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
mockChatPanelSurroundings();

let ConceptNoteChatPanel: typeof import("@/components/ConceptNoteWorkspace/chat-panel").ConceptNoteChatPanel;
const closeGap = jest.fn();
const fetchQuestion = jest.fn<typeof fetch>();

const readyStatus = contextPresentation("ready");
const edits = editControllerStub();
const gapAnswer = financingGapRequest({ chapterTitle: 'Financing plan "A"' });

setupDomShims({ resizeObserver: "immediate" });
const view = setupTestRoot();
const { byTestId, pickOption, writeAnswer } = view;
beforeAll(async () => {
  ({ ConceptNoteChatPanel } =
    await import("@/components/ConceptNoteWorkspace/chat-panel"));
});
beforeEach(() => {
  history = [];
  sent.length = 0;
  sessionStorage.clear();
  // Like the workspace, closing the gap unmounts the form in the same update.
  closeGap.mockImplementation(() => view.root.render(view.wrap(panel(null))));
  globalThis.fetch = fetchQuestion;
  fetchQuestion.mockResolvedValue(
    jsonResponse({
      why_asking: "Choose the support needed.",
      questions: [
        {
          question: "Which financing instrument?",
          options: ["Loan", "Grant"],
        },
        { question: "What amount?", options: [] },
      ],
    }),
  );
});

function panel(gap: GapAnswerRequest | null) {
  return (
    <ConceptNoteChatPanel
      cityId="city"
      contextStatus={readyStatus}
      composerRequest={null}
      gapAnswer={gap}
      onCloseGap={closeGap}
      onAddGapSource={() => {}}
      draftOverviewPending={false}
      lng="en"
      onOpenContext={() => {}}
      runId="run"
      threadId="thread"
      editScope={{ kind: "document" } as never}
      edits={edits}
    />
  );
}

async function render(gap: GapAnswerRequest | null): Promise<void> {
  await view.render(panel(gap));
  // The form asks for its questions after a short debounce.
  if (gap) await settle();
}

/** Answers the form partly (one question) or completely, then sends it. */
async function sendGapAnswer(
  complete: boolean,
  request: GapAnswerRequest = gapAnswer,
): Promise<string> {
  await render(request);
  await pickOption(0, "0");
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
  it.each([
    {
      complete: false,
      answers: "1. Which financing instrument?\nSelected category: Loan",
    },
    {
      complete: true,
      answers:
        "1. Which financing instrument?\nSelected category: Loan\n\n2. What amount?\nEUR 2 million\nfrom the city budget",
    },
  ])(
    "shows the answers, not the instruction (complete: $complete)",
    async ({ complete, answers }) => {
      const content = await sendGapAnswer(complete);
      // Clima still receives the whole instruction.
      expect(content).toContain(NEUTRAL_REQUEST_TAIL);
      expect(sent[0][1]?.answer_complete).toBe(complete);

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

      // History returns the same plain text; the bubble reads the same. One
      // reload is enough: the complete answer has the multiline text.
      if (!complete) return;
      await act(async () => view.root.unmount());
      view.root = createRoot(view.container);
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
    expect(view.container.textContent).not.toContain(
      "Show request sent to Clima",
    );
  });
});

describe("readGapAnswerMessage", () => {
  const templates = () =>
    GAP_ANSWER_REQUEST_KEYS.map((key) =>
      t(key, { ...GAP_ANSWER_SLOTS, interpolation: { escapeValue: false } }),
    );
  const values = {
    chapter: 'Costs & "risks" (2026)',
    question: "What is the cost?\nInclude VAT [if any].",
    answer: "1. Cost?\nEUR 2 million\n\n$1 & 2 \\ (raw)",
  };

  it("reads chapter, question and answer from both templates, and nothing else", () => {
    for (const key of GAP_ANSWER_REQUEST_KEYS)
      expect(
        readGapAnswerMessage(
          t(key, { ...values, interpolation: { escapeValue: false } }),
          templates(),
        ),
      ).toEqual(values);
    expect(readGapAnswerMessage("Hello", templates())).toBeNull();
  });
});
