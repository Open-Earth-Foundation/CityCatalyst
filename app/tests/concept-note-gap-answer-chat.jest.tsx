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
  readConceptNoteThreadMessages,
  type ConceptNoteChatMessage,
} from "@/components/ConceptNoteWorkspace/chat-utils";
import type { GapAnswerRequest } from "@/components/ConceptNoteWorkspace/gap-answer-form";
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
const sent: string[] = [];
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
        sendMessage: async (content: string) => {
          sent.push(content);
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
  globalThis.fetch = async (input) =>
    String(input).endsWith("/answers/")
      ? jsonResponse(null, 204)
      : jsonResponse({
          why_asking: "Choose the support needed.",
          questions: [
            {
              question: "Which financing instrument?",
              options: ["Loan", "Grant"],
            },
            { question: "What amount?", options: [] },
          ],
        });
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

// jsdom includes hidden disclosure text in textContent.
function visibleText(message: Element): string {
  const copy = message.cloneNode(true) as Element;
  copy.querySelectorAll("[hidden]").forEach((hidden) => hidden.remove());
  return copy.textContent ?? "";
}

describe("a sent gap answer in the chat", () => {
  it("shows the submitted answers live and after reopening chat, with the full request on demand", async () => {
    await render(gapAnswer);
    await pickOption(0, "0");
    await writeAnswer(1, "EUR 2 million\nfrom the city budget");
    await act(async () => byTestId("concept-note-gap-preview")!.click());

    const [content] = sent;
    const answers =
      "1. Which financing instrument?\nSelected category: Loan\n\n2. What amount?\nEUR 2 million\nfrom the city budget";
    const bubble = () => byTestId("concept-note-gap-answer-message")!;
    const request = () =>
      document.getElementById(
        bubble().querySelector("button")!.getAttribute("aria-controls")!,
      )!;
    expect(visibleText(bubble())).toContain(answers);
    expect(visibleText(bubble())).not.toContain(content);
    expect(request().hidden).toBe(true);
    await act(async () => bubble().querySelector("button")!.click());
    expect(request().hidden).toBe(false);
    expect(request().textContent).toBe(content);

    await act(async () => view.root.unmount());
    view.root = createRoot(view.container);
    history = readConceptNoteThreadMessages({
      messages: [{ message_id: "saved", role: "user", text: content }],
    });
    await render(null);
    expect(visibleText(bubble())).toContain(answers);
    expect(visibleText(bubble())).not.toContain(content);
    expect(request().hidden).toBe(true);
  });

  it("distinguishes an estimate confirmation in history from ordinary user messages", async () => {
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
    history.push({
      id: "estimate",
      role: "user",
      text: 'For the missing information in "Delivery":\nHow many volunteers?\n\nMy answers:\n150 confirmed volunteers\n\nPropose an update for me to review that replaces the current estimate using my answers. Keep all missing-information markers. Do not apply changes without my acceptance.',
    });
    await render(null);
    const summaries = view.container.querySelectorAll(
      '[data-testid="concept-note-gap-answer-message"]',
    );
    expect(summaries).toHaveLength(1);
    expect(visibleText(summaries[0])).toContain("150 confirmed volunteers");
    expect(visibleText(summaries[0])).not.toContain("Propose an update");
    const conversation = visibleText(byTestId("concept-note-chat-scroll")!);
    for (const message of typed) expect(conversation).toContain(message);
  });
});
