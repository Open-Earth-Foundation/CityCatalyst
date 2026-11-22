/** @jest-environment jsdom */

import { beforeAll, beforeEach, expect, it, jest } from "@jest/globals";
import { act } from "react";
import type { GapAnswerRequest } from "@/components/ConceptNoteWorkspace/gap-answer-form";
import type { EditScope } from "@/util/concept-note-edit-types";
import type { ConceptNoteUploadResponse } from "@/util/types";
import {
  conceptNotesI18n,
  contextPresentation,
  editControllerStub,
  financingGapRequest,
  jsonResponse,
  keyDown,
  mockChatPanelSurroundings,
  mockTranslation,
  settle,
  typeInto,
  setupDomShims,
  setupTestRoot,
} from "./helpers/concept-note-ui";

const sendMessage =
  jest.fn<(content: string, scope?: EditScope) => Promise<void>>();
const closeGap = jest.fn();
const gapSaved = jest.fn();
const refreshDraft = jest.fn();
let isGenerating = false;
const promptI18n = await conceptNotesI18n();
const t = (key: string, values?: Record<string, unknown>) => {
  if (
    key === "gap-answer-request" ||
    key === "gap-answer-estimate-confirm-request"
  )
    return promptI18n.t(key, values);
  if (key === "gap-selected-category")
    return `Selected category: ${values?.value}`;
  return key;
};

mockTranslation(t);
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
mockChatPanelSurroundings();

let ConceptNoteChatPanel: typeof import("@/components/ConceptNoteWorkspace/chat-panel").ConceptNoteChatPanel;
const fetchQuestion = jest.fn<typeof fetch>();
// Answers saved on a gap go to their own route; every other fetch is a question.
const saveAnswers = jest.fn<typeof fetch>();
const savedBody = (call = -1) =>
  JSON.parse(String(saveAnswers.mock.calls.at(call)![1]!.body));

const contextStatus = contextPresentation("none");
const edits = editControllerStub();

setupDomShims();
const view = setupTestRoot();
const { byTestId, button, card, customField, pickOption, writeAnswer } = view;
beforeAll(async () => {
  ({ ConceptNoteChatPanel } =
    await import("@/components/ConceptNoteWorkspace/chat-panel"));
});
beforeEach(() => {
  isGenerating = false;
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
) {
  return (
    <ConceptNoteChatPanel
      cityId="city"
      contextStatus={status}
      composerRequest={null}
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
): Promise<void> {
  await view.render(panel(status, threadId, gapAnswer, uploads));
  if (gapAnswer) await settle();
}

function composer(): HTMLTextAreaElement {
  const element = byTestId<HTMLTextAreaElement>("concept-note-chat-input");
  expect(element?.tagName).toBe("TEXTAREA");
  return element!;
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
    expect(composer().placeholder).toBe("chat-input-placeholder");
    expect(composer().getAttribute("aria-describedby")).toBe(
      "concept-note-chat-blocked",
    );
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

const gapAnswer = financingGapRequest({
  gap: {
    suggestions: [
      { value: "Loan", source_refs: ["investment-plan"] },
      { value: "Grant", source_refs: ["grant-application"] },
    ],
    source_refs: ["investment-plan", "grant-application"],
  },
});

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

it("shows generated multiple-choice answers without claiming they are sourced facts", async () => {
  await renderPanel(contextStatus, "thread", gapAnswer);
  expect(fetchQuestion.mock.calls[0][0]).toBe(
    "/api/v1/concept-notes/run/gap-question/",
  );
  expect(card(0).textContent).toContain("1Which financing instrument?");
  expect(card(1).textContent).toContain("2What amount?");
  // The long gap request is collapsible context, not the heading.
  expect(view.container.textContent).toContain("gap-questions-heading");
  expect(byTestId("concept-note-gap-question")?.textContent).toBe(
    gapAnswer.row.question,
  );
  expect(view.container.textContent).toContain("Guarantee");
  expect(view.container.textContent).toContain("gap-other");
  expect(view.container.textContent).toContain("gap-not-decided");
  expect(sendMessage).not.toHaveBeenCalled();
  const preview = previewButton();
  expect(preview.disabled).toBe(true);
  await pickOption(0, "0");
  expect(preview.disabled).toBe(false);
  // A partial answer is saved on the gap, then previewed in the chat.
  expect(preview.textContent).toBe("gap-preview-change");
  expect(view.container.textContent).toContain("gap-acceptance-hint");
  await act(async () => preview.click());
  expect(sendMessage).toHaveBeenCalledTimes(1);
  expect(saveAnswers.mock.calls[0][0]).toBe(
    "/api/v1/concept-notes/run/gaps/financing-gap/answers/",
  );
  // Bound to its gap version; the unanswered question is left out, not sent as
  // "Not decided yet".
  expect(savedBody()).toEqual({
    gap_version: 1,
    answers: "1. Which financing instrument?\nSelected category: Loan",
    expected_previous: null,
  });
  expect(sendMessage.mock.calls[0][0]).not.toContain("What amount?");
  expect(sendMessage.mock.calls[0][0]).not.toContain("gap-not-decided");
  expect(gapSaved).not.toHaveBeenCalled();
  expect(closeGap).toHaveBeenCalledTimes(1);
});

it("saves on the secondary action without starting a chat turn", async () => {
  await renderPanel(contextStatus, "thread", gapAnswer);
  await pickOption(0, "0");
  await act(async () => button("gap-save-answers")!.click());
  expect(saveAnswers).toHaveBeenCalledTimes(1);
  expect(sendMessage).not.toHaveBeenCalled();
  expect(gapSaved).toHaveBeenCalledTimes(1);
  expect(closeGap).toHaveBeenCalledTimes(1);
  // Back in the conversation, a note says the chapter changes later.
  await renderPanel(contextStatus, "thread", null);
  expect(byTestId("concept-note-gap-saved-note")?.textContent).toContain(
    "gap-answers-saved-note",
  );
});

it("keeps the form open with an error when saving answers fails", async () => {
  saveAnswers.mockResolvedValue({ ok: false } as Response);
  await renderPanel(contextStatus, "thread", gapAnswer);
  await pickOption(0, "0");
  await act(async () => previewButton().click());
  expect(view.container.querySelector('[role="alert"]')?.textContent).toBe(
    "gap-save-failed",
  );
  expect(closeGap).not.toHaveBeenCalled();
  expect(gapSaved).not.toHaveBeenCalled();
});

it("keeps the typed answer and never sends chat when a complete save conflicts", async () => {
  let answerSave!: (response: Response) => void;
  saveAnswers.mockImplementationOnce(
    () =>
      new Promise<Response>((resolve) => {
        answerSave = resolve;
      }),
  );
  const customValue = (index: number) => customField(index)!.value;
  await renderPanel(contextStatus, "thread", gapAnswer);
  await pickOption(0, "custom");
  await writeAnswer(0, "Blended loan and grant");
  await writeAnswer(1, "EUR 2 million");
  await act(async () => previewButton().click());
  // The save is still pending, so nothing has been sent to chat.
  expect(sendMessage).not.toHaveBeenCalled();
  await act(async () => answerSave({ ok: false, status: 409 } as Response));
  expect(view.container.querySelector('[role="alert"]')?.textContent).toBe(
    "gap-save-conflict",
  );
  expect(refreshDraft).toHaveBeenCalledTimes(1);
  expect(sendMessage).not.toHaveBeenCalled();
  expect(closeGap).not.toHaveBeenCalled();
  expect(customValue(0)).toBe("Blended loan and grant");
  expect(customValue(1)).toBe("EUR 2 million");
});

it("shows source-grounded suggestions with their source and adds one to the answer", async () => {
  await renderPanel(contextStatus, "thread", gapAnswer);
  const box = byTestId<HTMLElement>("concept-note-gap-source-suggestions")!;
  expect(box.textContent).toContain("Loan");
  expect(box.textContent).toContain("gap-source-label");
  // Each question says where its answer is usually found, when there is a hint.
  const hints = view.container.querySelectorAll(
    '[data-testid="concept-note-gap-where-to-find"]',
  );
  expect(hints).toHaveLength(1);
  expect(card(0).contains(hints[0])).toBe(true);
  const use = [...box.querySelectorAll("button")];
  expect(use).toHaveLength(2);
  // Source text alone is enough to send, even with no question answered yet.
  expect(previewButton().disabled).toBe(true);
  await act(async () => use[1].click());
  expect(use[1].disabled).toBe(true);
  expect(previewButton().disabled).toBe(false);
  await act(async () => previewButton().click());
  expect(sendMessage).toHaveBeenCalledTimes(1);
  expect(savedBody().answers).not.toContain("What amount?");
  expect(savedBody().answers).toContain("Grant");
});

it("names each source by its uploaded document and file type, or a readable label", async () => {
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
  expect(lines).toContain(
    "gap-source-label Krakow KST IV Investment Plan · PDF",
  );
  // No upload matches, so the label is humanized and no file type is invented.
  expect(lines).toContain("gap-source-label Annex 7 Cost Breakdown");
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
  const radios = [
    ...card(0).querySelectorAll<HTMLInputElement>('input[type="radio"]'),
  ].map((radio) => radio.value);
  // One fixed "still correct" choice, no preselection, no free-text "Other".
  expect(radios).toEqual(["0", "custom", "unknown"]);
  expect(card(0).textContent).toContain("gap-confirm-yes");
  expect(card(0).textContent).toContain("gap-confirm-changed");
  await pickOption(0, "custom");
  // "Changed" without the new value is not an answer.
  expect(previewButton().disabled).toBe(true);
  await writeAnswer(0, "A EUR 3 million grant");
  expect(view.container.textContent).toContain("gap-acceptance-hint");
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
  const boxes = () => [
    ...card(0).querySelectorAll<HTMLInputElement>('input[type="checkbox"]'),
  ];
  expect(card(0).querySelector('input[type="radio"]')).toBeNull();
  expect(boxes().map((box) => box.value)).toEqual([
    "0",
    "1",
    "2",
    "custom",
    "unknown",
  ]);
  await act(async () => boxes()[0].click());
  await act(async () => boxes()[2].click());
  await act(async () => boxes()[3].click());
  // An empty "Other" does not undo the options already selected.
  expect(previewButton().disabled).toBe(false);
  await writeAnswer(0, "EIB loan");
  // "Not decided yet" clears the other selections, and choosing again clears it.
  await act(async () => boxes()[4].click());
  expect(
    boxes()
      .filter((box) => box.checked)
      .map((box) => box.value),
  ).toEqual(["unknown"]);
  await act(async () => boxes()[0].click());
  await act(async () => boxes()[2].click());
  await act(async () => boxes()[3].click());
  await act(async () => previewButton().click());
  const [content] = sendMessage.mock.calls[0];
  expect(content).toContain(
    "1. Which co-financing sources apply?\nSelected category: EU cohesion funds; Selected category: City budget; EIB loan",
  );
});

it("sends the complete answers in one neutral request for the bound gap", async () => {
  await renderPanel(contextStatus, "thread", gapAnswer);
  await pickOption(0, "custom");
  await writeAnswer(0, "Blended loan and grant");
  await writeAnswer(1, "EUR 2 million");
  expect(view.container.textContent).toContain("gap-acceptance-hint");
  saveAnswers.mockResolvedValueOnce({ ok: true, status: 204 } as Response);
  await act(async () => previewButton().click());
  // The answers are saved (204) before the one chat request that replaces the marker.
  expect(saveAnswers).toHaveBeenCalledTimes(1);
  expect(sendMessage).toHaveBeenCalledTimes(1);
  expect(saveAnswers.mock.invocationCallOrder[0]).toBeLessThan(
    sendMessage.mock.invocationCallOrder[0],
  );
  const [content, scope] = sendMessage.mock.calls[0];
  expect(scope).toMatchObject({
    gap_id: "financing-gap",
    answer_complete: true,
  });
  expect(content).toContain(
    "My answer:\n1. Which financing instrument?\nBlended loan and grant\n\n2. What amount?\nEUR 2 million",
  );
  // The request quotes no marker: Clima's coverage review decides what closes it.
  expect(content).not.toContain("[Information needed:");
  expect(content).not.toContain("replaces");
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
        gap_version: null,
      },
    },
  } as unknown as GapAnswerRequest["row"];
  let answerSave!: (response: Response) => void;
  saveAnswers.mockImplementationOnce(
    () =>
      new Promise<Response>((resolve) => {
        answerSave = resolve;
      }),
  );
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
  await act(async () => answerSave({ ok: true, status: 204 } as Response));
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
  // An estimate has no marker to replace, so none is quoted or invented.
  expect(content).not.toContain("[Information needed:");
  expect(content).not.toContain("marked as missing");
});

it("leaves the gap untouched when answered later and restores the answers on return", async () => {
  await renderPanel(contextStatus, "thread", gapAnswer);
  await pickOption(0, "1");
  await writeAnswer(1, "EUR 2 million");
  const later = button("gap-answer-later")!;
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
  const startOver = button("gap-earlier-answers-clear")!;
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
  sessionStorage.setItem(
    "cnb-gap-draft:run:financing-chapter:financing-gap:1",
    JSON.stringify({
      question: null,
      choices: { 0: "custom" },
      customAnswers: { [`0:${gapAnswer.row.question}`]: "Loan" },
      details: "",
    }),
  );
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
  expect(card(0)).toBeUndefined();
  expect(view.container.textContent).toContain("gap-earlier-answers-cover");
  expect(view.container.textContent).toContain("gap-acceptance-hint");
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
  expect(view.container.querySelectorAll('input[type="radio"]')).toHaveLength(
    2,
  );
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
    "gap-question-unavailable",
  );
  await writeAnswer(0, "Loan");
  // The fallback asks the recorded gap itself, so its answer can close it.
  expect(view.container.textContent).toContain("gap-acceptance-hint");
  const details = () =>
    byTestId<HTMLTextAreaElement>("concept-note-gap-details")!.value;
  // A retry that fails again moves the typed answer to the details.
  fetchQuestion.mockRejectedValueOnce(new Error("offline"));
  await act(async () => button("gap-retry-question")!.click());
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
  await act(async () => button("gap-retry-question")!.click());
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
  expect(charsLeft()?.textContent).toBe("gap-characters-left");
  // The last field may only take what is left of the shared limit.
  expect(field(3).maxLength).toBeLessThan(2000);
  // Text set past the limit (the browser would refuse to type it) blocks Preview.
  await writeAnswer(3, "x".repeat(2000));
  expect(charsLeft()?.textContent).toBe("gap-answer-too-long");
  expect(previewButton().disabled).toBe(true);
  await act(async () => previewButton().form!.requestSubmit());
  expect(sendMessage).not.toHaveBeenCalled();
  expect(closeGap).not.toHaveBeenCalled();
  expect(field(3).value).toHaveLength(2000);
});

it("keeps an undecided answer explicit instead of selecting an invented fact", async () => {
  await renderPanel(contextStatus, "thread", gapAnswer);
  await pickOption(0, "unknown");
  // Not decided yet alone is not an answer, so there is nothing to preview.
  expect(previewButton().disabled).toBe(true);
  await writeAnswer(1, "EUR 2 million");
  await act(async () => previewButton().click());
  expect(sendMessage).toHaveBeenCalledTimes(1);
  expect(savedBody().answers).toBe(
    "1. Which financing instrument?\ngap-not-decided\n\n2. What amount?\nEUR 2 million",
  );
});

it("saves partial answers before previewing them and leaves untouched questions out", async () => {
  fetchQuestion.mockResolvedValue(
    jsonResponse({
      why_asking: "The funder needs the concept, phase and budget.",
      questions: [
        {
          question: "Which concept is proposed?",
          options: ["Wilson Pond Concept A", "Wilson Pond Concept B"],
        },
        { question: "What is the project phase?", options: ["Design"] },
        {
          question: "What is the budget?",
          options: ["$2,000,000", "$3,000,000"],
        },
        { question: "Who leads delivery?", options: [] },
      ],
    }),
  );
  await renderPanel(contextStatus, "thread", gapAnswer);
  await pickOption(0, "0");
  await pickOption(1, "unknown");
  await pickOption(2, "0");
  // The fourth question stays untouched; the answers are saved, then previewed.
  expect(previewButton().textContent).toBe("gap-preview-change");
  await act(async () => previewButton().click());

  expect(saveAnswers).toHaveBeenCalledTimes(1);
  expect(saveAnswers.mock.calls[0][0]).toBe(
    "/api/v1/concept-notes/run/gaps/financing-gap/answers/",
  );
  expect(savedBody()).toEqual({
    gap_version: 1,
    answers: [
      "1. Which concept is proposed?",
      "Selected category: Wilson Pond Concept A",
      "",
      "2. What is the project phase?",
      "gap-not-decided",
      "",
      "3. What is the budget?",
      "Selected category: $2,000,000",
    ].join("\n"),
    expected_previous: null,
  });
  expect(sendMessage).toHaveBeenCalledTimes(1);
  expect(gapSaved).not.toHaveBeenCalled();
  expect(closeGap).toHaveBeenCalledTimes(1);
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
    resolveOld(
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

it("preserves apostrophes, ampersands and source URLs in the plain-text gap answer", async () => {
  await renderPanel(contextStatus, "thread", gapAnswer);
  const answer =
    "EIB's PPP & financing details: https://www.eib.org/en/projects";
  await writeAnswer(1, answer);
  await act(async () => previewButton().click());
  // Partial, so the answers are saved on the gap as plain text.
  const saved = savedBody().answers;
  expect(saved).toContain(answer);
  expect(saved).not.toContain("&#");
  expect(saved).not.toContain("Source:");
});
