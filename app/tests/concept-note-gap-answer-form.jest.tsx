/** @jest-environment jsdom */

/**
 * GapAnswerForm on its own: closed or missing gaps, and Escape. The real
 * component and English copy are mounted; only fetch is mocked.
 */
import {
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";
import { act, type ComponentProps } from "react";
import translations from "@/i18n/locales/en/concept-notes.json";
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
const onSaved = jest.fn<(answers: string) => void>();
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
const { byTestId, button, card } = view;
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
  onSaved.mockReset();
  onClose.mockReset();
});

type FormProps = Partial<ComponentProps<typeof GapAnswerForm>>;

/** Mounts the form and waits for its 200 ms debounced question request. */
async function mount(props: FormProps = {}): Promise<void> {
  await view.render(
    <GapAnswerForm
      runId="run"
      request={request}
      lng="en"
      disabled={false}
      answerLimit={8000}
      onAnswer={onAnswer}
      onSaved={onSaved}
      onClose={onClose}
      onAddSource={() => {}}
      {...props}
    />,
  );
  await settle();
}

const details = () => byTestId<HTMLTextAreaElement>("concept-note-gap-details");
const preview = () => byTestId<HTMLButtonElement>("concept-note-gap-preview");
const en = (key: keyof typeof translations) => translations[key];

describe("a closed or missing gap is not answered as if choices failed", () => {
  it("shows a closed state for 409, with no fields and no submit", async () => {
    fetchQuestion.mockImplementation(() =>
      reply(409, { detail: "Gap is no longer open" }),
    );
    await mount();
    expect(byTestId("concept-note-gap-answer-heading")?.textContent).toBe(
      en("gap-closed-heading"),
    );
    expect(byTestId("concept-note-gap-closed")?.textContent).toContain(
      en("gap-closed-message"),
    );
    expect(view.container.textContent).not.toContain(
      en("gap-question-unavailable"),
    );
    expect(view.container.querySelector("textarea")).toBeNull();
    expect(view.container.querySelector("input")).toBeNull();
    expect(preview()).toBeNull();
    expect(button(en("gap-retry-question"))).toBeUndefined();
    expect(button(en("gap-answer-later"))).toBeUndefined();
    // One clear way back.
    const back = [...view.container.querySelectorAll("button")].filter(
      (element) => element.textContent === en("gap-back-to-chat"),
    );
    expect(back).toHaveLength(1);
    await act(async () => back[0].click());
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onAnswer).not.toHaveBeenCalled();
  });

  it("shows a missing state for 404 (chapter or marker gone)", async () => {
    fetchQuestion.mockImplementation(() =>
      reply(404, { detail: "Gap question not found" }),
    );
    await mount();
    expect(byTestId("concept-note-gap-answer-heading")?.textContent).toBe(
      en("gap-missing-heading"),
    );
    expect(view.container.textContent).toContain(en("gap-missing-message"));
    expect(view.container.textContent).not.toContain(
      en("gap-question-unavailable"),
    );
    expect(view.container.querySelector("textarea")).toBeNull();
    expect(preview()).toBeNull();
  });
});

it("closes on Escape from an option or a text field, like Back to conversation", async () => {
  await mount();
  await key(card(0).querySelector('input[value="1"]')!, "Escape");
  expect(onClose).toHaveBeenCalledTimes(1);
  await key(details()!, "Escape");
  expect(onClose).toHaveBeenCalledTimes(2);
});
