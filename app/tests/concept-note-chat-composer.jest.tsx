/** @jest-environment jsdom */

import { beforeAll, beforeEach, expect, it, jest } from "@jest/globals";
import { act } from "react";
import {
  readConceptNoteThreadMessages,
  type ConceptNoteChatMessage,
} from "@/components/ConceptNoteWorkspace/chat-utils";
import { LuInfo } from "react-icons/lu";
import type { ConceptNoteContextPresentation } from "@/components/ConceptNoteWorkspace/context-status";
import type { EditController } from "@/components/ConceptNoteWorkspace/document-review";
import type { GapAnswerRequest } from "@/components/ConceptNoteWorkspace/gap-answer-form";
import type { EditScope } from "@/util/concept-note-edit-types";
import type { ConceptNoteUploadResponse } from "@/util/types";
import {
  conceptNotesI18n,
  jsonResponse,
  keyDown,
  mockTranslation,
  settle,
  typeInto,
  setupDomShims,
  setupTestRoot,
} from "./helpers/concept-note-ui";
import type { ChatSendResult } from "@/components/ConceptNoteWorkspace/use-concept-note-chat";

const sendMessage =
  jest.fn<
    (
      content: string,
      scope?: EditScope,
      questionMessageId?: string,
    ) => Promise<void | ChatSendResult>
  >();
const closeGap = jest.fn();
const gapSaved = jest.fn();
const refreshDraft = jest.fn();
let isGenerating = false;
let messages: ConceptNoteChatMessage[] = [];
const i18n = await conceptNotesI18n();
mockTranslation(i18n.t.bind(i18n), i18n);
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
const fetchQuestion = jest.fn<typeof fetch>();
// Answers saved on a gap go to their own route; every other fetch is a question.
const saveAnswers = jest.fn<typeof fetch>();
const savedBody = (call = -1) =>
  JSON.parse(String(saveAnswers.mock.calls.at(call)![1]!.body));

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

setupDomShims();
const view = setupTestRoot();
const { byTestId, button, card, customField, pickOption, writeAnswer } = view;
beforeAll(async () => {
  ({ ConceptNoteChatPanel } =
    await import("@/components/ConceptNoteWorkspace/chat-panel"));
});
beforeEach(() => {
  isGenerating = false;
  messages = [];
  sendMessage.mockReset();
  closeGap.mockClear();
  gapSaved.mockClear();
  refreshDraft.mockClear();
  sendMessage.mockResolvedValue(undefined);
});

function panel(
  status = contextStatus,
  threadId: string | null = "thread",
  gapAnswer: GapAnswerRequest | null = null,
  uploads?: ConceptNoteUploadResponse[],
  composerRequest: { id: string; content: string } | null = null,
) {
  return (
    <ConceptNoteChatPanel
      cityId="city"
      contextStatus={status}
      composerRequest={composerRequest}
      gapAnswer={gapAnswer}
      onCloseGap={closeGap}
      onGapAnswersSaved={gapSaved}
      onRefreshDraft={refreshDraft}
      onAddGapSource={() => {}}
      draftOverviewPending={false}
      lng="en"
      onOpenContext={() => {}}
      runId="run"
      threadId={threadId}
      editScope={{ kind: "document" } as never}
      edits={edits}
      uploads={uploads}
    />
  );
}

async function renderPanel(
  status = contextStatus,
  threadId: string | null = "thread",
  gapAnswer: GapAnswerRequest | null = null,
  uploads?: ConceptNoteUploadResponse[],
  composerRequest: { id: string; content: string } | null = null,
): Promise<void> {
  await view.render(
    panel(status, threadId, gapAnswer, uploads, composerRequest),
  );
  if (gapAnswer) await settle();
}

function composer(): HTMLTextAreaElement {
  return byTestId<HTMLTextAreaElement>("concept-note-chat-input")!;
}

const type = (value: string) => typeInto(composer(), value);
const pressEnter = (shiftKey = false) =>
  keyDown(composer(), "Enter", { shiftKey });

it.each(["uploading", "processing", "preparing"] as const)(
  "allows typing while context is %s, but waits for readiness before sending",
  async (state) => {
    await renderPanel();
    await type("A draft before processing");
    await renderPanel({ ...contextStatus, state, blocked: true });

    expect(composer().disabled).toBe(false);
    expect(composer().value).toBe("A draft before processing");
    await type("A draft edited during processing");
    const send = byTestId<HTMLButtonElement>("concept-note-chat-send")!;
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
  await act(async () => composer().form!.requestSubmit());
  expect(sendMessage).not.toHaveBeenCalled();
});

it("keeps the composer editable while Clima responds but holds the send", async () => {
  isGenerating = true;
  await renderPanel();

  expect(composer().disabled).toBe(false);
  await type("Draft my next question");
  await pressEnter();

  expect(sendMessage).not.toHaveBeenCalled();
  expect(composer().value).toBe("Draft my next question");
  const send = byTestId<HTMLButtonElement>("concept-note-chat-send");
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
  globalThis.fetch = ((input, init) =>
    String(input).includes("/answers/")
      ? saveAnswers(input, init)
      : fetchQuestion(input, init)) as typeof fetch;
  saveAnswers.mockReset();
  saveAnswers.mockResolvedValue({ ok: true } as Response);
  fetchQuestion.mockReset();
  fetchQuestion.mockResolvedValue(
    jsonResponse({
      why_asking: "Choose the support needed.",
      questions: [
        {
          question: "Which financing instrument?",
          options: ["Loan", "Grant", "Guarantee"],
          where_to_find: "Loan agreement or lender term sheet",
        },
        { question: "What amount?", options: [] },
      ],
    }),
  );
});

const previewButton = () =>
  byTestId<HTMLButtonElement>("concept-note-gap-preview")!;

it.each([404, 409])(
  "returns an unavailable gap (%i) to chat without sending",
  async (status) => {
    fetchQuestion.mockResolvedValue(jsonResponse({}, status));
    await renderPanel(contextStatus, "thread", gapAnswer);
    expect(previewButton()).toBeNull();
    await act(async () => button("Back to conversation")!.click());
    expect(closeGap).toHaveBeenCalledTimes(1);
    expect(sendMessage).not.toHaveBeenCalled();
  },
);

it("lets the user leave a gap by pressing Escape while answering", async () => {
  await renderPanel(contextStatus, "thread", gapAnswer);
  for (const field of [card(0).querySelector("input")!, customField(1)!]) {
    closeGap.mockClear();
    await keyDown(field, "Escape");
    expect(closeGap).toHaveBeenCalledTimes(1);
  }
});

it("saves on the secondary action without starting a chat turn", async () => {
  await renderPanel(contextStatus, "thread", gapAnswer);
  await pickOption(0, "0");
  await act(async () => button("Save answers so far")!.click());
  expect(savedBody()).toEqual({
    gap_version: 1,
    answers: "1. Which financing instrument?\nSelected category: Loan",
    expected_previous: null,
  });
  expect(sendMessage).not.toHaveBeenCalled();
  expect(gapSaved).toHaveBeenCalledTimes(1);
  expect(closeGap).toHaveBeenCalledTimes(1);
});

it.each([
  [409, "changed", 1],
  [503, "could not be saved", 0],
] as const)(
  "keeps the unsent answer on save failure (%i)",
  async (status, message, refreshes) => {
    saveAnswers.mockResolvedValue(jsonResponse({}, status));
    await renderPanel(contextStatus, "thread", gapAnswer);
    await writeAnswer(1, "EUR 2 million");
    await act(async () => previewButton().click());
    expect(
      view.container.querySelector('[role="alert"]')?.textContent,
    ).toContain(message);
    expect(customField(1)!.value).toBe("EUR 2 million");
    expect(refreshDraft).toHaveBeenCalledTimes(refreshes);
    expect(closeGap).not.toHaveBeenCalled();
    expect(sendMessage).not.toHaveBeenCalled();
  },
);

it("uses the chosen source value and shows where each value came from", async () => {
  const krakowGap = structuredClone(gapAnswer);
  krakowGap.row.gap!.suggestions = [
    {
      value: "Reported total project value: PLN 1.92 billion.",
      source_refs: ["Krakow_KST_IV_Investment_Plan"],
    },
    { value: "Lifecycle cost", source_refs: ["Annex_7_Cost_Breakdown"] },
  ];
  await renderPanel(contextStatus, "thread", krakowGap, [
    {
      uploadId: "upload",
      status: "ready",
      filename: "Krakow_KST_IV_Investment_Plan.pdf",
      sourceLabel: "Krakow_KST_IV_Investment_Plan",
    },
  ]);
  const lines = [
    ...view.container.querySelectorAll(
      '[data-testid="concept-note-gap-source-suggestions"] p',
    ),
  ].map((line) => line.textContent);
  expect(lines).toContain("Source: Krakow KST IV Investment Plan · PDF");
  // No upload matches, so the label is humanized and no file type is invented.
  expect(lines).toContain("Source: Annex 7 Cost Breakdown");
  expect(card(0).textContent).toContain("Loan agreement or lender term sheet");
  const use = byTestId("concept-note-gap-source-suggestions")!.querySelector(
    "button",
  )!;
  await act(async () => use.click());
  await act(async () => previewButton().click());
  expect(savedBody().answers).toContain(
    "Reported total project value: PLN 1.92 billion.",
  );
  expect(savedBody().answers).not.toContain("Lifecycle cost");
});

it("needs the current value before a changed source value counts as answered", async () => {
  fetchQuestion.mockResolvedValue(
    jsonResponse({
      why_asking: "Confirm the instrument.",
      questions: [
        { question: "Is the loan still planned?", options: [], confirms: true },
      ],
    }),
  );
  await renderPanel(contextStatus, "thread", gapAnswer);
  await pickOption(0, "custom");
  // "Changed" without the new value is not an answer.
  expect(previewButton().disabled).toBe(true);
  await writeAnswer(0, "A EUR 3 million grant");
  await act(async () => previewButton().click());
  expect(savedBody().answers).toContain("A EUR 3 million grant");
  expect(sendMessage.mock.calls[0][1]?.answer_complete).toBe(true);
});

it("lets the user pick every option that applies when several can", async () => {
  fetchQuestion.mockResolvedValue(
    jsonResponse({
      why_asking: "The funder needs every co-financing source.",
      questions: [
        {
          question: "Which co-financing sources apply?",
          options: ["EU cohesion funds", "National budget", "City budget"],
          multiple: true,
        },
      ],
    }),
  );
  await renderPanel(contextStatus, "thread", gapAnswer);
  const chooseSources = async () => {
    for (const value of ["0", "2", "custom"]) await pickOption(0, value);
  };
  await chooseSources();
  // An empty "Other" does not undo the options already selected.
  expect(previewButton().disabled).toBe(false);
  await writeAnswer(0, "EIB loan");
  // "Not decided yet" clears the other selections, and choosing again clears it.
  await pickOption(0, "unknown");
  const checked = card(0).querySelectorAll<HTMLInputElement>("input:checked");
  expect([...checked].map((option) => option.value)).toEqual(["unknown"]);
  await chooseSources();
  await act(async () => previewButton().click());
  const [content] = sendMessage.mock.calls[0];
  expect(content).toContain(
    "1. Which co-financing sources apply?\nSelected category: EU cohesion funds; Selected category: City budget; EIB loan",
  );
});

it("saves complete answers before sending them and preserves their summary in chat history", async () => {
  await renderPanel(contextStatus, "thread", gapAnswer);
  const answer =
    "EUR 2 million\nfrom the city's O&M budget: https://www.eib.org/en/projects";
  await pickOption(0, "0");
  await writeAnswer(1, answer);
  await act(async () => previewButton().click());

  const [[content, scope]] = sendMessage.mock.calls;
  expect(scope).toMatchObject({
    gap_id: "financing-gap",
    answer_complete: true,
  });
  const answers =
    "1. Which financing instrument?\nSelected category: Loan\n\n2. What amount?\n" +
    answer;
  expect(savedBody().answers).toBe(answers);
  expect(content).toContain(answers);
  expect(content).not.toContain("[Information needed:");
  expect(saveAnswers.mock.invocationCallOrder[0]).toBeLessThan(
    sendMessage.mock.invocationCallOrder[0],
  );

  messages = [{ id: "sent", role: "user", text: content }];
  await renderPanel();
  const bubble = () => byTestId("concept-note-gap-answer-message")!;
  const disclosure = () => bubble().querySelector("button")!;
  const fullRequest = () =>
    document.getElementById(disclosure().getAttribute("aria-controls")!)!;
  const visible = bubble().cloneNode(true) as Element;
  visible.querySelector("[hidden]")?.remove();
  expect(visible.textContent).toContain(answers);
  expect(visible.textContent).not.toContain(content);
  expect(fullRequest().hidden).toBe(true);
  await act(async () => disclosure().click());
  expect(fullRequest().hidden).toBe(false);
  expect(fullRequest().textContent).toBe(content);

  await view.render(null);
  const ordinary =
    'For the missing information in "Financing":\nWhat is it?\n\nMy answer:\nLoan';
  messages = readConceptNoteThreadMessages({
    messages: [
      { message_id: "saved", role: "user", text: content },
      { message_id: "question", role: "user", text: ordinary },
    ],
  });
  await renderPanel();
  expect(bubble().textContent).toContain(answers);
  expect(fullRequest().hidden).toBe(true);
  expect(view.container.textContent).toContain(ordinary);
  expect(
    view.container.querySelectorAll(
      '[data-testid="concept-note-gap-answer-message"]',
    ),
  ).toHaveLength(1);
});

it("previews an estimate confirmation without asking to replace a marker", async () => {
  const estimate = "The City estimates 120 volunteers, pending confirmation.";
  const caveatRow = {
    ...gapAnswer.row,
    gap: {
      ...gapAnswer.row.gap!,
      state: "caveat",
      version: 2,
      resolution: {
        resolution_id: "estimate-event",
        action: "answer",
        answer: estimate,
        actor_user_id: "owner",
        source_refs: [],
        created_at: "2026-10-16T00:00:00Z",
      },
    },
  } satisfies GapAnswerRequest["row"];
  const save = Promise.withResolvers<Response>();
  saveAnswers.mockReturnValueOnce(save.promise);
  await renderPanel(contextStatus, "thread", {
    ...gapAnswer,
    row: caveatRow,
  });
  await pickOption(0, "custom");
  await writeAnswer(0, "Confirmed 150 volunteers");
  await writeAnswer(1, "City records, May 2026");
  await act(async () => previewButton().click());
  // The estimate is confirmed only after the answers are saved (204).
  expect(sendMessage).not.toHaveBeenCalled();
  await act(async () => save.resolve(jsonResponse({}, 204)));
  expect(sendMessage).toHaveBeenCalledTimes(1);
  expect(saveAnswers.mock.invocationCallOrder[0]).toBeLessThan(
    sendMessage.mock.invocationCallOrder[0],
  );
  const [content, scope] = sendMessage.mock.calls[0];
  expect(scope).toMatchObject({
    gap_id: "financing-gap",
    gap_version: 2,
    answer_complete: true,
  });
  expect(content).toContain(
    "My answers:\n1. Which financing instrument?\nConfirmed 150 volunteers\n\n2. What amount?\nCity records, May 2026",
  );
  expect(content).toContain("replaces the current estimate using my answers");
  messages = [{ id: "estimate", role: "user", text: content }];
  await renderPanel();
  expect(byTestId("concept-note-gap-answer-message")?.textContent).toContain(
    "Confirmed 150 volunteers",
  );
  // An estimate has no marker to replace, so none is quoted or invented.
  expect(content).not.toContain("[Information needed:");
  expect(content).not.toContain("marked as missing");
});

it("leaves the gap untouched when answered later and restores the answers on return", async () => {
  await renderPanel(contextStatus, "thread", gapAnswer);
  await pickOption(0, "1");
  await writeAnswer(1, "EUR 2 million");
  const later = button("Save for later")!;
  await act(async () => later.click());
  expect(closeGap).toHaveBeenCalledTimes(1);
  expect(sendMessage).not.toHaveBeenCalled();

  // Reopening shows the same questions and answers without generating new ones.
  await renderPanel(contextStatus, "thread", null);
  await renderPanel(contextStatus, "thread", gapAnswer);
  expect(fetchQuestion).toHaveBeenCalledTimes(1);
  expect(
    card(0).querySelector<HTMLInputElement>('input[type="radio"][value="1"]')!
      .checked,
  ).toBe(true);
  expect(customField(1)!.value).toBe("EUR 2 million");

  // A sent answer is also saved on the gap, so a failed turn loses nothing.
  // Like the workspace, closing the gap unmounts the form in the same update.
  closeGap.mockImplementationOnce(() =>
    view.root.render(view.wrap(panel(contextStatus, "thread", null))),
  );
  await act(async () => previewButton().click());
  const [firstRequest] = sendMessage.mock.calls[0];
  const earlier = savedBody().answers;
  expect(earlier).toContain("2. What amount?\nEUR 2 million");
  expect(firstRequest).toContain(earlier);

  // Reopening (on any device) shows the gap's saved answers; the server, not
  // the browser, passes them to the question model.
  const saved = structuredClone(gapAnswer);
  saved.row.gap!.answered_so_far = earlier;
  await renderPanel(contextStatus, "thread", null);
  await renderPanel(contextStatus, "thread", saved);
  expect(fetchQuestion).toHaveBeenCalledTimes(2);
  expect(
    JSON.parse(String(fetchQuestion.mock.calls[1][1]!.body)),
  ).not.toHaveProperty("earlier_answers");
  expect(byTestId("concept-note-gap-earlier-answers")?.textContent).toContain(
    "EUR 2 million",
  );
  await writeAnswer(1, "EUR 3 million from the city budget");
  await act(async () => previewButton().click());
  // Still partial, so the combined answers are saved again, replacing the old.
  // The new figure replaces the saved one for the same question.
  expect(savedBody().answers).toContain(
    "1. Which financing instrument?\nSelected category: Grant",
  );
  expect(savedBody().answers).toContain(
    "2. What amount?\nEUR 3 million from the city budget",
  );
  expect(savedBody().answers).not.toContain("EUR 2 million");
  expect(sendMessage).toHaveBeenCalledTimes(2);

  // Starting over clears the saved answers for everyone and asks afresh.
  await renderPanel(contextStatus, "thread", null);
  await renderPanel(contextStatus, "thread", saved);
  const startOver = button("Start over without them")!;
  gapSaved.mockClear();
  await act(async () => startOver.click());
  await settle();
  expect(savedBody()).toEqual({
    gap_version: 1,
    answers: "",
    expected_previous: earlier,
  });
  expect(gapSaved).toHaveBeenCalledTimes(1);
  expect(byTestId("concept-note-gap-earlier-answers")).toBeNull();

  // A closed gap gets a new version, without saved answers.
  const nextVersion = structuredClone(gapAnswer);
  nextVersion.row.gap!.version = 2;
  await renderPanel(contextStatus, "thread", null);
  const fetches = fetchQuestion.mock.calls.length;
  await renderPanel(contextStatus, "thread", nextVersion);
  expect(fetchQuestion).toHaveBeenCalledTimes(fetches + 1);
  expect(byTestId("concept-note-gap-earlier-answers")).toBeNull();
});

it("keeps a saved fallback answer when reopening brings generated questions", async () => {
  fetchQuestion.mockRejectedValueOnce(new Error("offline"));
  await renderPanel(contextStatus, "thread", gapAnswer);
  await writeAnswer(0, "Loan");
  await act(async () => button("Save for later")!.click());
  await renderPanel(contextStatus, "thread", null);
  await renderPanel(contextStatus, "thread", gapAnswer);
  expect(card(0).textContent).toContain("Which financing instrument?");
  expect(byTestId<HTMLTextAreaElement>("concept-note-gap-details")!.value).toBe(
    "Loan",
  );
});

it("lets earlier answers alone complete the gap when nothing is missing", async () => {
  const saved = structuredClone(gapAnswer);
  saved.row.gap!.answered_so_far = "1. Which financing instrument?\nLoan";
  fetchQuestion.mockResolvedValue(
    jsonResponse({ why_asking: "Covered.", questions: [] }),
  );
  await renderPanel(contextStatus, "thread", saved);
  await act(async () => previewButton().click());
  const [content, scope] = sendMessage.mock.calls[0];
  expect(content).toContain("1. Which financing instrument?\nLoan");
  expect(scope).toMatchObject({ answer_complete: true });
});

it("offers free text for gaps without suggestions and blocks submission while Clima is busy", async () => {
  isGenerating = true;
  fetchQuestion.mockResolvedValue(
    jsonResponse({
      why_asking: "Provide the exact amount.",
      questions: [{ question: "What amount?", options: [] }],
    }),
  );
  await renderPanel(contextStatus, "thread", gapAnswer);
  await writeAnswer(0, "Loan");
  const form = previewButton().form!;
  await act(async () => form.requestSubmit());
  expect(sendMessage).not.toHaveBeenCalled();
  isGenerating = false;
  await renderPanel(contextStatus, "thread", gapAnswer);
  await act(async () => form.requestSubmit());
  expect(sendMessage.mock.calls[0][0]).toContain(
    "My answer:\n1. What amount?\nLoan",
  );
});

it("falls back to free text on failure and keeps it in the details across retries", async () => {
  fetchQuestion.mockRejectedValueOnce(new Error("offline"));
  await renderPanel(contextStatus, "thread", gapAnswer);
  expect(view.container.querySelector('[role="alert"]')?.textContent).toContain(
    "answer below",
  );
  await writeAnswer(0, "Loan");
  const details = () =>
    byTestId<HTMLTextAreaElement>("concept-note-gap-details")!.value;
  // A retry that fails again moves the typed answer to the details.
  fetchQuestion.mockRejectedValueOnce(new Error("offline"));
  await act(async () => button("Retry answer choices")!.click());
  await settle();
  expect(customField(0)!.value).toBe("");
  expect(details()).toBe("Loan");
  expect(previewButton().disabled).toBe(false);
  fetchQuestion.mockResolvedValueOnce(
    jsonResponse({
      why_asking: "Timing matters.",
      questions: [{ question: "What completion year?", options: [] }],
    }),
  );
  await act(async () => button("Retry answer choices")!.click());
  await settle();
  expect(card(0).textContent).toContain("What completion year?");
  // The typed answer is never attached to a different question...
  expect(customField(0)!.value).toBe("");
  // ...but stays visible in the details, once, so it is still sent.
  expect(details()).toBe("Loan");
  await act(async () => previewButton().click());
  expect(sendMessage.mock.calls[0][0]).toContain("Loan");
  expect(sendMessage.mock.calls[0][0]).not.toContain("What completion year?");
});

it("counts down the shared edit limit and stops answers before it is exceeded", async () => {
  fetchQuestion.mockResolvedValue(
    jsonResponse({
      why_asking: "Several parts are missing.",
      questions: [1, 2, 3, 4].map((part) => ({
        question: `Part ${part}?`,
        options: [],
      })),
    }),
  );
  await renderPanel(contextStatus, "thread", gapAnswer);
  // The form replaces the chat box, so Preview is its only submit.
  expect(byTestId("concept-note-chat-input")).toBeNull();
  const field = (index: number) => customField(index)!;
  const charsLeft = () => byTestId("concept-note-gap-chars-left");
  for (const index of [0, 1, 2]) await writeAnswer(index, "x".repeat(2000));
  // The last field may only take what is left of the shared limit.
  expect(field(3).maxLength).toBeLessThan(2000);
  // Text set past the limit (the browser would refuse to type it) blocks Preview.
  await writeAnswer(3, "x".repeat(2000));
  expect(charsLeft()?.textContent).toContain("too long");
  expect(previewButton().disabled).toBe(true);
  await act(async () => previewButton().form!.requestSubmit());
  expect(sendMessage).not.toHaveBeenCalled();
  expect(closeGap).not.toHaveBeenCalled();
  expect(field(3).value).toHaveLength(2000);
});

it("saves and previews only the answered parts, including an explicit undecided choice", async () => {
  fetchQuestion.mockResolvedValue(
    jsonResponse({
      why_asking: "Funding",
      questions: [
        { question: "Which financing instrument?", options: ["Loan", "Grant"] },
        { question: "What amount?", options: [] },
        { question: "Who signs?", options: [] },
      ],
    }),
  );
  await renderPanel(contextStatus, "thread", gapAnswer);
  await pickOption(0, "unknown");
  expect(previewButton().disabled).toBe(true);
  await writeAnswer(1, "EUR 2 million");
  await act(async () => previewButton().click());
  expect(savedBody()).toEqual({
    gap_version: 1,
    expected_previous: null,
    answers:
      "1. Which financing instrument?\nNot decided yet\n\n2. What amount?\nEUR 2 million",
  });
  expect(sendMessage.mock.calls[0][1]).toMatchObject({
    answer_complete: false,
  });
});

it("cancels stale generation when another gap is opened", async () => {
  const oldQuestion = Promise.withResolvers<Response>();
  fetchQuestion.mockReturnValueOnce(oldQuestion.promise);
  await renderPanel(contextStatus, "thread", gapAnswer);
  const oldSignal = fetchQuestion.mock.calls[0][1]?.signal;
  await renderPanel(contextStatus, "thread", {
    ...gapAnswer,
    row: { ...gapAnswer.row, id: "next-gap" },
  });
  expect(oldSignal?.aborted).toBe(true);
  await act(async () =>
    oldQuestion.resolve(
      jsonResponse({
        why_asking: "Old",
        questions: [
          { question: "Stale question?", options: ["Old", "Outdated"] },
        ],
      }),
    ),
  );
  expect(view.container.textContent).toContain("Which financing instrument?");
  expect(view.container.textContent).not.toContain("Stale question?");
});

it("keeps the new gap open when the previous preview finishes saving", async () => {
  const pending = Promise.withResolvers<Response>();
  saveAnswers.mockReturnValueOnce(pending.promise);
  await renderPanel(contextStatus, "thread", gapAnswer);
  await writeAnswer(1, "EUR 2 million");
  await act(async () => previewButton().click());

  const next = structuredClone(gapAnswer);
  next.row.id = "next-gap";
  next.row.gap!.gap_id = "next-gap";
  await renderPanel(contextStatus, "thread", next);
  await writeAnswer(1, "A different budget");
  await act(async () => pending.resolve(jsonResponse({}, 204)));
  expect(customField(1)!.value).toBe("A different budget");
  expect(closeGap).not.toHaveBeenCalled();
  expect(sendMessage).not.toHaveBeenCalled();
});

describe("scrolling to Clima's newest reply", () => {
  // jsdom has no layout, so the chat column and reply geometry are stubbed.
  const chatTop = 100;
  const chatClientHeight = 324;
  const chatContentHeight = 1000;
  let replyTop = 0;
  let scrollTo: jest.Mock<(options: ScrollToOptions) => void>;
  let originalRect: typeof HTMLElement.prototype.getBoundingClientRect;
  let suiteScrollTo: typeof HTMLElement.prototype.scrollTo;
  let requestFrame: jest.SpiedFunction<typeof window.requestAnimationFrame>;

  const rect = (top: number) =>
    ({
      top,
      bottom: top,
      left: 0,
      right: 0,
      width: 0,
      height: 0,
      x: 0,
      y: top,
      toJSON: () => ({}),
    }) as DOMRect;

  beforeEach(() => {
    messages = [
      { id: "question-1", role: "user", text: "Summarise the plan" },
      { id: "reply-1", role: "assistant", text: "Here is the draft plan." },
    ];
    originalRect = HTMLElement.prototype.getBoundingClientRect;
    HTMLElement.prototype.getBoundingClientRect = function (this: HTMLElement) {
      if (this.dataset.testid === "concept-note-chat-scroll") {
        return rect(chatTop);
      }
      if (this.hasAttribute("data-chat-message")) return rect(replyTop);
      return originalRect.call(this);
    };
    Object.defineProperty(HTMLElement.prototype, "scrollHeight", {
      configurable: true,
      get(this: HTMLElement) {
        return this.dataset.testid === "concept-note-chat-scroll"
          ? chatContentHeight
          : 0;
      },
    });
    Object.defineProperty(HTMLElement.prototype, "clientHeight", {
      configurable: true,
      get(this: HTMLElement) {
        return this.dataset.testid === "concept-note-chat-scroll"
          ? chatClientHeight
          : 0;
      },
    });
    suiteScrollTo = HTMLElement.prototype.scrollTo;
    scrollTo = jest.fn<(options: ScrollToOptions) => void>();
    HTMLElement.prototype.scrollTo = scrollTo;
    // Run frames synchronously so the scroll happens inside the render's act().
    requestFrame = jest
      .spyOn(window, "requestAnimationFrame")
      .mockImplementation((callback: FrameRequestCallback) => {
        callback(0);
        return 0;
      });
  });

  afterEach(() => {
    messages = [];
    HTMLElement.prototype.getBoundingClientRect = originalRect;
    Reflect.deleteProperty(HTMLElement.prototype, "scrollHeight");
    Reflect.deleteProperty(HTMLElement.prototype, "clientHeight");
    HTMLElement.prototype.scrollTo = suiteScrollTo;
    requestFrame.mockRestore();
  });

  it("stops at the start of a reply taller than the chat area", async () => {
    // The reply starts 400px into the content, so it is 600px tall.
    replyTop = chatTop + 400;
    await renderPanel();

    // 16px of padding above the reply's top edge.
    expect(scrollTo).toHaveBeenLastCalledWith({ behavior: "auto", top: 384 });
  });

  it("follows the bottom while the newest reply fits in the chat area", async () => {
    // The reply starts 900px into the content, so it is 100px tall.
    replyTop = chatTop + 900;
    await renderPanel();

    // Bottom is scrollHeight minus clientHeight: 1000 - 324.
    expect(scrollTo).toHaveBeenLastCalledWith({ behavior: "auto", top: 676 });
  });
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
  const element = view.container.querySelector<HTMLTextAreaElement>(
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
    view.container
      .querySelector<HTMLButtonElement>("button[aria-pressed]")!
      .click(),
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
    view.container.querySelector(
      '[data-testid="concept-note-saved-answer-draft"]',
    ),
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
    view.container.querySelector(
      '[data-testid="concept-note-saved-answer-draft"]',
    )?.textContent,
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
    view.container.querySelector<HTMLTextAreaElement>(
      '[data-testid="concept-note-chat-choices"] textarea',
    )!.value,
  ).toBe("");
  await typeInline("Thread two inline");
  await type("Thread two composer");
  await renderPanel(contextStatus, "thread");
  expect(composer().value).toBe("Thread one composer");
  expect(
    view.container.querySelector<HTMLTextAreaElement>(
      '[data-testid="concept-note-chat-choices"] textarea',
    )!.value,
  ).toBe("Thread one inline");
  expect(sendMessage).not.toHaveBeenCalled();
});
it("does not reapply an already used composer request when switching threads", async () => {
  const request = { id: "prefill-once", content: "Requested draft" };
  await renderPanel(contextStatus, "thread", null, undefined, request);
  await act(async () => {
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => resolve()),
    );
  });
  expect(composer().value).toBe("Requested draft");
  await type("Edited thread one draft");
  await renderPanel(contextStatus, "other-thread", null, undefined, request);
  await act(async () => {
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => resolve()),
    );
  });
  expect(composer().value).toBe("");
  await renderPanel(contextStatus, "thread", null, undefined, request);
  expect(composer().value).toBe("Edited thread one draft");
  expect(sendMessage).not.toHaveBeenCalled();
});

it("keeps an over-limit composer message, blocks sending and explains the limit", async () => {
  await renderPanel();
  await type("y".repeat(8_010));
  const send = view.container.querySelector<HTMLButtonElement>(
    '[data-testid="concept-note-chat-send"]',
  )!;

  expect(send.disabled).toBe(true);
  expect(
    view.container.querySelector("#concept-note-chat-too-long")?.textContent,
  ).toBe("Shorten this message by 10 characters to send it.");
  expect(composer().getAttribute("aria-describedby")).toBe(
    "concept-note-chat-too-long",
  );
  await act(async () => composer().form!.requestSubmit());
  expect(sendMessage).not.toHaveBeenCalled();
  expect(composer().value).toHaveLength(8_010);
});

it("moves keyboard focus to the composer as soon as a suggested answer is sent", async () => {
  let finish!: (value: ChatSendResult) => void;
  sendMessage.mockImplementation(
    () =>
      new Promise<ChatSendResult>((resolve) => {
        finish = resolve;
      }),
  );
  messages = [choiceQuestion()];
  await renderPanel();
  const option = view.container.querySelector<HTMLButtonElement>(
    "button[aria-pressed]",
  )!;
  await act(async () => {
    option.focus();
    option.click();
  });

  // Still streaming: focus must not wait for the reply to finish.
  expect(document.activeElement).toBe(composer());
  await act(async () => finish("replied"));
});

it("announces a finished suggested-answer question politely", async () => {
  messages = [choiceQuestion()];
  await renderPanel();
  const status = view.container.querySelector(
    '[data-testid="concept-note-chat-question-announcement"]',
  )!;
  expect(status.getAttribute("aria-live")).toBe("polite");
  expect(status.textContent).not.toBe("");

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
    view.container.querySelector('[data-testid="concept-note-chat-unsent"]')
      ?.textContent,
  ).toBe("Not sent");
  const options = view.container.querySelectorAll<HTMLButtonElement>(
    "button[aria-pressed]",
  );
  // Not selected and still answerable, so the user can choose again.
  expect([...options].map((option) => option.disabled)).toEqual([false, false]);
  expect(options[0].getAttribute("aria-pressed")).toBe("false");
  expect(
    view.container.querySelector(
      '[data-testid="concept-note-chat-choices"] textarea',
    ),
  ).not.toBeNull();
});

function pendingSend(): (result: ChatSendResult) => Promise<void> {
  let finish!: (result: ChatSendResult) => void;
  sendMessage.mockImplementation(
    () =>
      new Promise<ChatSendResult>((resolve) => {
        finish = resolve;
      }),
  );
  return (result) => act(async () => finish(result));
}

it("puts a message the service rejected unsaved back in the composer", async () => {
  sendMessage.mockResolvedValue("not_saved");
  await renderPanel();
  await type("Could the budget be shorter?");
  await pressEnter();

  expect(sendMessage).toHaveBeenCalledTimes(1);
  expect(composer().value).toBe("Could the budget be shorter?");
});

it("keeps text typed while the rejected send was pending as a separate paragraph", async () => {
  const finish = pendingSend();
  await renderPanel();
  await type("Could the budget be shorter?");
  await pressEnter();
  expect(composer().value).toBe("");
  await type("Also mention the grant.");

  await finish("not_saved");
  expect(composer().value).toBe(
    "Could the budget be shorter?\n\nAlso mention the grant.",
  );
  expect(sendMessage).toHaveBeenCalledTimes(1);
});

it.each(["failed", "replied"] as const)(
  "leaves the composer empty when the message may be saved (%s)",
  async (result) => {
    sendMessage.mockResolvedValue(result);
    await renderPanel();
    await type("Could the budget be shorter?");
    await pressEnter();
    expect(composer().value).toBe("");
  },
);

it("restores a rejected message to the chat it was written in", async () => {
  const finish = pendingSend();
  await renderPanel();
  await type("Could the budget be shorter?");
  await pressEnter();
  await renderPanel(contextStatus, "other-thread");

  await finish("not_saved");
  expect(composer().value).toBe("");
  await renderPanel();
  expect(composer().value).toBe("Could the budget be shorter?");
});
