/** @jest-environment jsdom */

/**
 * GapAnswerForm on its own: closed or missing gaps, and Escape. The real
 * component and English copy are mounted; only fetch is mocked.
 */
import { beforeAll, beforeEach, expect, it, jest } from "@jest/globals";
import { act } from "react";
import {
  conceptNotesI18n,
  financingGapRequest,
  jsonResponse,
  keyDown as key,
  mockTranslation,
  settle,
  setupDomShims,
  setupTestRoot,
} from "./helpers/concept-note-ui";

const i18n = await conceptNotesI18n({ namespaced: true });
mockTranslation(i18n.t.bind(i18n));

let GapAnswerForm: typeof import("@/components/ConceptNoteWorkspace/gap-answer-form").GapAnswerForm;
const fetchQuestion = jest.fn<typeof fetch>();
const onAnswer = jest.fn<(answer: string, complete: boolean) => boolean>();
const onClose = jest.fn();

const GAP_QUESTION = "What financing does the project request from the funder?";
const request = financingGapRequest({
  question: GAP_QUESTION,
  whyAsking: "The funder needs the type and amount of support.",
  gap: { field_key: "financing" },
});
const QUESTIONS = {
  why_asking: "Choose the support needed.",
  questions: [
    {
      question: "Which financing instrument?",
      options: ["Loan", "Grant", "Guarantee"],
    },
    { question: "What amount?", options: [] },
  ],
};

const reply = (status: number, body: unknown = {}) =>
  Promise.resolve(jsonResponse(body, status));

setupDomShims();
const view = setupTestRoot();
const { byTestId, card } = view;
beforeAll(async () => {
  ({ GapAnswerForm } =
    await import("@/components/ConceptNoteWorkspace/gap-answer-form"));
});
beforeEach(() => {
  sessionStorage.clear();
  fetchQuestion.mockReset();
  fetchQuestion.mockImplementation(() => reply(200, QUESTIONS));
  globalThis.fetch = fetchQuestion;
  onAnswer.mockReset();
  onAnswer.mockReturnValue(true);
  onClose.mockReset();
});

/** Mounts the form and waits for its 200 ms debounced question request. */
async function mount(): Promise<void> {
  await view.render(
    <GapAnswerForm
      runId="run"
      request={request}
      lng="en"
      disabled={false}
      answerLimit={8000}
      onAnswer={onAnswer}
      onSaved={() => {}}
      onClose={onClose}
      onAddSource={() => {}}
    />,
  );
  await settle();
}

it.each([404, 409])(
  "returns the user to chat without submitting an unavailable gap (%i)",
  async (status) => {
    fetchQuestion.mockImplementation(() => reply(status));
    await mount();
    expect(view.container.querySelector("textarea, input")).toBeNull();
    expect(byTestId("concept-note-gap-preview")).toBeNull();
    const back = view.button("Back to conversation")!;
    await act(async () => back.click());
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onAnswer).not.toHaveBeenCalled();
  },
);

it("closes on Escape from an option or a text field, like Back to conversation", async () => {
  await mount();
  await key(card(0).querySelector('input[value="1"]')!, "Escape");
  expect(onClose).toHaveBeenCalledTimes(1);
  await key(byTestId("concept-note-gap-details")!, "Escape");
  expect(onClose).toHaveBeenCalledTimes(2);
});
