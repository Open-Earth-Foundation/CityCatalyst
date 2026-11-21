/** @jest-environment jsdom */

/**
 * GapAnswerForm on its own: closed/missing gaps, typed text that must survive
 * retries and reopening, typing while questions load, keyboard handling, the
 * shared length limit and the reasons shown next to a disabled Preview.
 * The real component and English copy are mounted; only fetch is mocked.
 */
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
import { act, type ComponentProps } from "react";
import { createRoot, type Root } from "react-dom/client";
import { createInstance } from "i18next";
import translations from "@/i18n/locales/en/concept-notes.json";
import type { GapAnswerRequest } from "@/components/ConceptNoteWorkspace/gap-answer-form";

const i18n = createInstance();
jest.unstable_mockModule("@/i18n/client", () => ({
  useTranslation: () => ({ t: i18n.t.bind(i18n) }),
}));

let GapAnswerForm: typeof import("@/components/ConceptNoteWorkspace/gap-answer-form").GapAnswerForm;
let root: Root;
let container: HTMLDivElement;
const fetchQuestion = jest.fn<typeof fetch>();
const onAnswer = jest.fn<(answer: string, complete: boolean) => boolean>();
const onSaved = jest.fn<(answers: string) => void>();
const onClose = jest.fn();
const originals = {
  fetch: globalThis.fetch,
  ResizeObserver: globalThis.ResizeObserver,
  scrollIntoView: HTMLElement.prototype.scrollIntoView,
  CSS: globalThis.CSS,
  structuredClone: globalThis.structuredClone,
};

const GAP_QUESTION = "What financing does the project request from the funder?";
const DRAFT_KEY = "cnb-gap-draft:run:financing-chapter:financing-gap:1";
const request: GapAnswerRequest = {
  chapterId: "financing-chapter",
  chapterTitle: "Financing plan",
  row: {
    id: "financing-gap",
    question: GAP_QUESTION,
    whyAsking: "The funder needs the type and amount of support.",
    severity: "critical",
    gap: {
      gap_id: "financing-gap",
      field_key: "financing",
      question: GAP_QUESTION,
      why_asking: "The funder needs the type and amount of support.",
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

/** A fetch result as the proxy returns it (only status and body matter). */
const reply = (status: number, body: unknown = {}) =>
  Promise.resolve({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response);

beforeAll(async () => {
  await i18n.init({
    lng: "en",
    resources: { en: { "concept-notes": translations } },
    ns: ["concept-notes"],
    defaultNS: "concept-notes",
  });
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  HTMLElement.prototype.scrollIntoView = jest.fn();
  globalThis.CSS = { ...originals.CSS, escape: (value: string) => value };
  // jsdom lacks structuredClone, which Chakra recipes use.
  globalThis.structuredClone = (value) =>
    value === undefined ? value : JSON.parse(JSON.stringify(value));
  globalThis.ResizeObserver = class {
    disconnect() {}
    observe() {}
    unobserve() {}
  };
  ({ GapAnswerForm } =
    await import("@/components/ConceptNoteWorkspace/gap-answer-form"));
});
afterAll(() => {
  globalThis.fetch = originals.fetch;
  globalThis.ResizeObserver = originals.ResizeObserver;
  HTMLElement.prototype.scrollIntoView = originals.scrollIntoView;
  globalThis.CSS = originals.CSS;
  globalThis.structuredClone = originals.structuredClone;
  globalThis.IS_REACT_ACT_ENVIRONMENT = false;
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
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

type FormProps = Partial<ComponentProps<typeof GapAnswerForm>>;

/** Mounts the form and waits for its 200 ms debounced question request. */
async function mount(props: FormProps = {}): Promise<void> {
  await act(async () => {
    root.render(
      <ChakraProvider value={defaultSystem}>
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
        />
      </ChakraProvider>,
    );
  });
  await settle();
}

async function settle(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 250));
  });
}

/** Unmounts the form the way the workspace does when it closes. */
async function unmount(): Promise<void> {
  await act(async () => root.render(<></>));
}

const q = <T extends Element = HTMLElement>(selector: string) =>
  container.querySelector<T>(selector);
const byTestId = <T extends Element = HTMLElement>(id: string) =>
  q<T>(`[data-testid="${id}"]`);
const card = (index: number) =>
  container.querySelectorAll<HTMLElement>(
    '[data-testid="concept-note-gap-subquestion"]',
  )[index];
const customField = (index: number) =>
  card(index)?.querySelector<HTMLTextAreaElement>(
    '[data-testid="concept-note-gap-custom-answer"]',
  ) ?? null;
const details = () => byTestId<HTMLTextAreaElement>("concept-note-gap-details");
const preview = () => byTestId<HTMLButtonElement>("concept-note-gap-preview");
const button = (label: string) =>
  [...container.querySelectorAll("button")].find(
    (element) => element.textContent?.trim() === label,
  );
const en = (key: keyof typeof translations) => translations[key];

async function setValue(field: HTMLTextAreaElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(
    HTMLTextAreaElement.prototype,
    "value",
  )!.set!;
  await act(async () => {
    setter.call(field, value);
    field.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

/** Pastes at the end, inserting only what maxLength allows (as a browser does). */
async function paste(field: HTMLTextAreaElement, text: string) {
  field.setSelectionRange(field.value.length, field.value.length);
  const event = new Event("paste", { bubbles: true, cancelable: true });
  Object.defineProperty(event, "clipboardData", {
    value: { getData: () => text },
  });
  await act(async () => {
    field.dispatchEvent(event);
  });
  await setValue(field, (field.value + text).slice(0, field.maxLength));
}

async function pick(index: number, value: string) {
  await act(async () =>
    card(index)
      .querySelector<HTMLInputElement>(`input[value="${value}"]`)!
      .click(),
  );
}

async function key(target: Element, name: string): Promise<KeyboardEvent> {
  const event = new KeyboardEvent("keydown", {
    key: name,
    bubbles: true,
    cancelable: true,
  });
  await act(async () => {
    target.dispatchEvent(event);
  });
  return event;
}

const savedDraft = () => sessionStorage.getItem(DRAFT_KEY) ?? "";

describe("G-29: a closed or missing gap is not answered as if choices failed", () => {
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
    expect(container.textContent).not.toContain(en("gap-question-unavailable"));
    expect(container.querySelector("textarea")).toBeNull();
    expect(container.querySelector("input")).toBeNull();
    expect(preview()).toBeNull();
    expect(button(en("gap-retry-question"))).toBeUndefined();
    expect(button(en("gap-answer-later"))).toBeUndefined();
    // One clear way back.
    const back = [...container.querySelectorAll("button")].filter(
      (element) => element.textContent === en("gap-back-to-chat"),
    );
    expect(back).toHaveLength(1);
    await act(async () => back[0].click());
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onAnswer).not.toHaveBeenCalled();
  });

  it("shows a missing state for 404 (chapter or legacy marker gone)", async () => {
    fetchQuestion.mockImplementation(() =>
      reply(404, { detail: "Gap question not found" }),
    );
    await mount({
      request: { ...request, row: { ...request.row, gap: null } },
    });
    expect(byTestId("concept-note-gap-answer-heading")?.textContent).toBe(
      en("gap-missing-heading"),
    );
    expect(container.textContent).toContain(en("gap-missing-message"));
    expect(container.textContent).not.toContain(en("gap-question-unavailable"));
    expect(container.querySelector("textarea")).toBeNull();
    expect(preview()).toBeNull();
  });

  it("still shows the saved unsent answer when the gap closed meanwhile", async () => {
    sessionStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({
        question: null,
        choices: { 0: "custom" },
        customAnswers: { [`0:${GAP_QUESTION}`]: "EUR 2.5 million loan" },
        details: "",
      }),
    );
    fetchQuestion.mockImplementation(() => reply(409));
    await mount();
    expect(byTestId("concept-note-gap-unsent-text")?.textContent).toContain(
      "EUR 2.5 million loan",
    );
    expect(savedDraft()).toContain("EUR 2.5 million loan");
  });

  it.each([
    ["a 503", () => reply(503, { detail: "" })],
    ["a network error", () => Promise.reject(new Error("offline"))],
  ])("keeps the free-text fallback with Retry for %s", async (_, failure) => {
    fetchQuestion.mockImplementation(failure);
    await mount();
    expect(q('[role="alert"]')?.textContent).toContain(
      en("gap-question-unavailable"),
    );
    expect(button(en("gap-retry-question"))).toBeDefined();
    expect(customField(0)).not.toBeNull();
    expect(byTestId("concept-note-gap-closed")).toBeNull();
  });
});

describe("G-06: typed text is never silently lost", () => {
  it("moves a fallback answer into the details when Retry brings new questions", async () => {
    fetchQuestion.mockImplementationOnce(() => reply(503));
    await mount();
    await setValue(details()!, "Council vote in June.");
    await setValue(customField(0)!, "EUR 2.5 million concessional loan");
    await act(async () => button(en("gap-retry-question"))!.click());
    // Visible right away, while the new questions load.
    expect(details()!.value).toBe(
      "Council vote in June.\n\nEUR 2.5 million concessional loan",
    );
    await settle();
    expect(card(0).textContent).toContain("Which financing instrument?");
    // Never attached to a different question...
    expect(customField(1)!.value).toBe("");
    // ...but kept in the details, with a note saying why, and sent.
    expect(details()!.value).toContain("EUR 2.5 million concessional loan");
    expect(container.textContent).toContain(en("gap-answer-moved"));
    expect(savedDraft()).toContain("EUR 2.5 million concessional loan");
    // The partial answer is saved on the gap, then previewed with the moved text.
    await act(async () => preview()!.click());
    expect(onAnswer).toHaveBeenCalledTimes(1);
    expect(onAnswer.mock.calls[0][0]).toContain(
      "EUR 2.5 million concessional loan",
    );
    expect(onAnswer.mock.calls[0][1]).toBe(false);
    expect(onSaved).not.toHaveBeenCalled();
  });

  it("keeps a fallback answer saved for later when reopening generates questions", async () => {
    fetchQuestion.mockImplementationOnce(() => reply(503));
    await mount();
    await setValue(customField(0)!, "EUR 2.5 million concessional loan");
    await act(async () => button(en("gap-answer-later"))!.click());
    expect(onClose).toHaveBeenCalledTimes(1);
    await unmount();

    await mount();
    expect(fetchQuestion).toHaveBeenCalledTimes(2);
    expect(card(0).textContent).toContain("Which financing instrument?");
    expect(details()!.value).toBe("EUR 2.5 million concessional loan");
    expect(container.textContent).toContain(en("gap-answer-moved"));
    expect(savedDraft()).toContain("EUR 2.5 million concessional loan");
  });

  it("keeps typed answers, with their question, when starting over", async () => {
    sessionStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({
        question: QUESTIONS,
        choices: { 0: "custom", 1: "custom" },
        customAnswers: {
          "0:Which financing instrument?": "Green bond",
          "1:What amount?": "EUR 2 million",
        },
        details: "",
      }),
    );
    fetchQuestion.mockImplementation(() =>
      reply(200, {
        why_asking: "Fresh start.",
        questions: [{ question: "What is the total cost?", options: [] }],
      }),
    );
    await mount({
      request: {
        ...request,
        row: {
          ...request.row,
          gap: {
            ...request.row.gap!,
            answered_so_far: "1. Who applies?\nThe city",
          },
        },
      },
    });
    expect(fetchQuestion).not.toHaveBeenCalled();
    await act(async () => button(en("gap-earlier-answers-clear"))!.click());
    await settle();
    expect(onSaved).toHaveBeenCalledWith("");
    expect(card(0).textContent).toContain("What is the total cost?");
    expect(details()!.value).toBe(
      "Which financing instrument?\nGreen bond\n\nWhat amount?\nEUR 2 million",
    );
  });

  it("preserves a pre-integration sent draft as editable details", async () => {
    const sent = "1. Who applies?\nThe city";
    sessionStorage.setItem(
      DRAFT_KEY,
      JSON.stringify({
        question: null,
        choices: {},
        customAnswers: {},
        details: "",
        sent,
      }),
    );
    await mount();
    // Shown for review, but the server has no saved answers to send to the model.
    expect(details()!.value).toBe(sent);
    expect(container.textContent).toContain(en("gap-answer-moved"));
    for (const [, init] of fetchQuestion.mock.calls)
      expect(String(init?.body ?? "")).not.toContain("Who applies");
    expect(savedDraft()).not.toContain('"sent"');
  });
});

describe("G-33: the user can write while answer choices load", () => {
  it("shows the details field during loading and keeps its text when questions arrive", async () => {
    let release!: () => void;
    fetchQuestion.mockImplementation(
      () =>
        new Promise((resolve) => {
          release = () => resolve(reply(200, QUESTIONS));
        }),
    );
    await mount();
    expect(q('[role="status"]')?.textContent).toContain(
      en("gap-loading-write-now"),
    );
    expect(card(0)).toBeUndefined();
    await setValue(details()!, "EUR 2 million from the city budget");
    // Save for later during loading keeps it too.
    expect(savedDraft()).toContain("EUR 2 million from the city budget");
    expect(preview()!.disabled).toBe(true);
    await act(async () => release());
    await settle();
    expect(card(1).textContent).toContain("What amount?");
    expect(details()!.value).toBe("EUR 2 million from the city budget");
    expect(preview()!.disabled).toBe(false);
  });
});

describe("G-80 and Escape: keyboard", () => {
  it("does not let Enter on an option submit the form", async () => {
    await mount();
    await pick(0, "0");
    const radio = card(0).querySelector('input[value="0"]')!;
    expect((await key(radio, "Enter")).defaultPrevented).toBe(true);
    // Enter in a text field still adds a line instead of being blocked.
    expect((await key(customField(1)!, "Enter")).defaultPrevented).toBe(false);
    expect(onAnswer).not.toHaveBeenCalled();
    // Preview is the way to send: it saves the answers, then sends them.
    await act(async () => preview()!.click());
    expect(onAnswer).toHaveBeenCalledTimes(1);
    expect(onSaved).not.toHaveBeenCalled();
  });

  it("does not let Enter on a checkbox submit the form", async () => {
    fetchQuestion.mockImplementation(() =>
      reply(200, {
        why_asking: "Several apply.",
        questions: [
          {
            question: "Which sources?",
            options: ["EU", "City"],
            multiple: true,
          },
        ],
      }),
    );
    await mount();
    const box = card(0).querySelector('input[type="checkbox"][value="0"]')!;
    expect((await key(box, "Enter")).defaultPrevented).toBe(true);
    expect(onAnswer).not.toHaveBeenCalled();
  });

  it("closes on Escape from an option or a text field, like Back to conversation", async () => {
    await mount();
    await key(card(0).querySelector('input[value="1"]')!, "Escape");
    expect(onClose).toHaveBeenCalledTimes(1);
    await key(details()!, "Escape");
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("leaves Escape to an inner control that handles it", async () => {
    await mount();
    const field = details()!;
    field.addEventListener("keydown", (event) => event.preventDefault());
    await key(field, "Escape");
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe("G-84: the shared limit counts separators and says when text is cut", () => {
  // "1. What amount?\nNot answered yet" is 32 characters.
  const ONE_FREE = {
    why_asking: "Amount.",
    questions: [{ question: "What amount?", options: [] }],
  };
  const LIMIT = 100;

  it("lets the details fill the limit exactly without disabling Preview", async () => {
    fetchQuestion.mockImplementation(() => reply(200, ONE_FREE));
    await mount({ answerLimit: LIMIT });
    await setValue(customField(0)!, "EUR 2 million");
    // 100 - "1. What amount?\nEUR 2 million" (29) - "\n\n" (2)
    expect(details()!.maxLength).toBe(69);
    await setValue(details()!, "d".repeat(details()!.maxLength));
    expect(byTestId("concept-note-gap-chars-left")?.textContent).toBe(
      en("gap-characters-full"),
    );
    expect(preview()!.disabled).toBe(false);
    await act(async () => preview()!.click());
    expect(onAnswer.mock.calls[0][0]).toHaveLength(LIMIT);
  });

  it("frees the 'Not answered yet' filler when an empty answer is filled", async () => {
    fetchQuestion.mockImplementation(() => reply(200, ONE_FREE));
    await mount({ answerLimit: LIMIT });
    // 100 - "1. What amount?\n" (16)
    expect(customField(0)!.maxLength).toBe(84);
    await setValue(customField(0)!, "x".repeat(84));
    expect(preview()!.disabled).toBe(false);
    await act(async () => preview()!.click());
    expect(onAnswer.mock.calls[0][0]).toHaveLength(LIMIT);
  });

  it("counts the '; ' before Other in a multiple-answer question", async () => {
    fetchQuestion.mockImplementation(() =>
      reply(200, {
        why_asking: "Sources.",
        questions: [
          { question: "Which sources?", options: ["EU"], multiple: true },
        ],
      }),
    );
    await mount({ answerLimit: LIMIT });
    await pick(0, "0");
    await pick(0, "custom");
    await setValue(customField(0)!, "y".repeat(customField(0)!.maxLength));
    expect(preview()!.disabled).toBe(false);
    await act(async () => preview()!.click());
    expect(onAnswer.mock.calls[0][0]).toHaveLength(LIMIT);
  });

  it("says so when a paste or a keystroke does not fit, and clears once there is room", async () => {
    fetchQuestion.mockImplementation(() => reply(200, ONE_FREE));
    await mount({ answerLimit: LIMIT });
    const field = details()!;
    await paste(field, "p".repeat(20));
    expect(byTestId("concept-note-gap-text-cut")).toBeNull();
    await paste(field, "p".repeat(200));
    expect(field.value).toHaveLength(field.maxLength);
    expect(byTestId("concept-note-gap-text-cut")?.textContent).toBe(
      en("gap-text-cut"),
    );
    expect(byTestId("concept-note-gap-text-cut")?.getAttribute("role")).toBe(
      "alert",
    );
    await setValue(field, field.value.slice(0, 10));
    expect(byTestId("concept-note-gap-text-cut")).toBeNull();
    // Text that fits exactly is not a cut; typing past it is.
    await setValue(field, "t".repeat(field.maxLength));
    expect(byTestId("concept-note-gap-text-cut")).toBeNull();
    await key(field, "t");
    expect(byTestId("concept-note-gap-text-cut")).not.toBeNull();
  });
});

describe("G-85: an empty Other is pointed out", () => {
  it("shows a hint on the card until the answer is typed", async () => {
    await mount();
    // A free-text question starts on its text field; no hint there.
    expect(byTestId("concept-note-gap-other-empty")).toBeNull();
    await pick(0, "custom");
    const hint = card(0).querySelector(
      '[data-testid="concept-note-gap-other-empty"]',
    );
    expect(hint).not.toBeNull();
    expect(hint?.textContent).toBe(en("gap-other-empty"));
    expect(customField(0)!.getAttribute("aria-describedby")).toBe(hint!.id);
    await setValue(customField(0)!, "Green bond");
    expect(byTestId("concept-note-gap-other-empty")).toBeNull();
    expect(customField(0)!.getAttribute("aria-describedby")).toBeNull();
  });
});

describe("G-32 and G-34: a disabled Preview says why", () => {
  it("shows the parent's reason next to Preview while disabled", async () => {
    await mount({
      disabled: true,
      disabledReason: "Clima is still replying.",
    });
    await pick(0, "0");
    await pick(1, "custom");
    await setValue(customField(1)!, "EUR 2 million");
    const reason = byTestId("concept-note-gap-preview-reason")!;
    expect(preview()!.disabled).toBe(true);
    expect(reason.textContent).toBe("Clima is still replying.");
    expect(preview()!.nextElementSibling).toBe(reason);
    expect(preview()!.getAttribute("aria-describedby")).toBe(reason.id);
  });

  it("works without a reason from the parent", async () => {
    await mount({ disabled: true });
    await pick(0, "0");
    await pick(1, "custom");
    await setValue(customField(1)!, "EUR 2 million");
    expect(preview()!.disabled).toBe(true);
    expect(byTestId("concept-note-gap-preview-reason")).toBeNull();
  });

  it("explains that 'Not decided yet' everywhere leaves nothing to preview", async () => {
    await mount();
    expect(byTestId("concept-note-gap-preview-reason")).toBeNull();
    await pick(0, "unknown");
    await pick(1, "unknown");
    expect(preview()!.disabled).toBe(true);
    expect(byTestId("concept-note-gap-preview-reason")).not.toBeNull();
    expect(byTestId("concept-note-gap-preview-reason")?.textContent).toBe(
      en("gap-preview-needs-answer"),
    );
    await pick(0, "1");
    expect(preview()!.disabled).toBe(false);
    expect(byTestId("concept-note-gap-preview-reason")).toBeNull();
  });
});

describe("B4: the form and chat deliver facts and ask only what remains", () => {
  /** The body of the first request whose URL contains `path`. */
  const requestBody = (path: string) => {
    const call = fetchQuestion.mock.calls.find(([url]) =>
      String(url).includes(path),
    );
    return JSON.parse(String(call?.[1]?.body ?? "null"));
  };

  it("previews partial answers after saving them with CAS", async () => {
    await mount();
    await pick(0, "0");
    await act(async () => preview()!.click());
    const saved = requestBody("/answers");
    expect(saved).toMatchObject({ gap_version: 1, expected_previous: null });
    // Saved first, then sent with the very text that was saved.
    expect(onAnswer).toHaveBeenCalledTimes(1);
    expect(onAnswer.mock.calls[0][0]).toBe(saved.answers);
    expect(onAnswer.mock.calls[0][1]).toBe(false);
  });

  it("saves on the secondary action without starting a chat turn", async () => {
    await mount();
    await pick(0, "0");
    await act(async () => button(en("gap-save-answers"))!.click());
    expect(onSaved).toHaveBeenCalledTimes(1);
    expect(onSaved.mock.calls[0][0]).toContain("Selected category: Loan");
    expect(onAnswer).not.toHaveBeenCalled();
  });

  it("does not send on a stale answer save and preserves the input", async () => {
    await mount();
    await pick(0, "custom");
    await setValue(customField(0)!, "EUR 2 million");
    fetchQuestion.mockImplementation((url) =>
      String(url).includes("/answers") ? reply(409) : reply(200, QUESTIONS),
    );
    await act(async () => preview()!.click());
    expect(onAnswer).not.toHaveBeenCalled();
    expect(customField(0)!.value).toBe("EUR 2 million");
    expect(container.textContent).toContain(en("gap-save-conflict"));
  });

  it("reopens a narrowed gap with one remaining question", async () => {
    fetchQuestion.mockImplementation(() =>
      reply(200, {
        why_asking: "The amount is still needed.",
        questions: [
          {
            question: "What amount will the city contribute?",
            options: [],
          },
        ],
      }),
    );
    await mount();
    expect(
      container.querySelectorAll(
        '[data-testid="concept-note-gap-subquestion"]',
      ),
    ).toHaveLength(1);
    expect(card(0).textContent).toContain(
      "What amount will the city contribute?",
    );
    expect(card(0).textContent).not.toContain("Loan");
    // The bound gap's persisted question is the server's, so none is sent.
    expect(requestBody("/gap-question")).toEqual({
      chapter_id: "financing-chapter",
      gap_id: "financing-gap",
      language: "en",
    });
  });

  it("distinguishes user typed text from selected categories and unavailable answers", async () => {
    await mount();
    await pick(0, "1");
    await pick(1, "custom");
    await setValue(customField(1)!, "EUR 2 million");
    await act(async () => preview()!.click());
    expect(onAnswer.mock.calls[0][0]).toContain(
      "1. Which financing instrument?\nSelected category: Grant",
    );
    expect(onAnswer.mock.calls[0][0]).toContain(
      "2. What amount?\nEUR 2 million",
    );
    // A sent form closes, so the explicit "Not decided yet" uses a new one.
    await unmount();
    sessionStorage.clear();
    await mount();
    await pick(0, "unknown");
    await pick(1, "custom");
    await setValue(customField(1)!, "EUR 2 million");
    await act(async () => preview()!.click());
    expect(onAnswer.mock.calls[1][0]).toContain(
      `1. Which financing instrument?\n${en("gap-not-decided")}`,
    );
    expect(onAnswer.mock.calls[1][0]).not.toContain("Selected category");
  });

  it("looks up a long tracked question by ID without sending its text", async () => {
    const longQuestion = "Describe the funding source in detail. ".repeat(80);
    const longRequest: GapAnswerRequest = {
      ...request,
      row: {
        ...request.row,
        question: longQuestion,
        gap: { ...request.row.gap!, question: longQuestion },
      },
    };
    await mount({ request: longRequest });
    const body = requestBody("/gap-question");
    expect(body.gap_id).toBe("financing-gap");
    expect(body).not.toHaveProperty("question");
    expect(String(fetchQuestion.mock.calls[0][1]?.body)).not.toContain(
      "Describe the funding source",
    );
  });
});
