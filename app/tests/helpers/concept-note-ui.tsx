// Shared setup for the concept-note workspace component tests (jsdom).
// Call the setup* helpers at the top level of a test file: they register the
// Jest hooks themselves. Module mocks must still be registered before the
// test file's dynamic import of the component under test.
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  jest,
} from "@jest/globals";
import { ChakraProvider, defaultSystem } from "@chakra-ui/react";
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { LuInfo } from "react-icons/lu";
import { createInstance, type i18n as I18n, type TFunction } from "i18next";
import translations from "@/i18n/locales/en/concept-notes.json";
import type { ConceptNoteContextPresentation } from "@/components/ConceptNoteWorkspace/context-status";
import type { EditController } from "@/components/ConceptNoteWorkspace/document-review";
import type { GapAnswerRequest } from "@/components/ConceptNoteWorkspace/gap-answer-form";
import type { ConceptNoteDraftChapter, ConceptNoteGap } from "@/util/types";

type Theme = Parameters<typeof ChakraProvider>[0]["value"];

/** Tells React that updates are wrapped in act(). */
function setActEnvironment(enabled: boolean): void {
  (
    globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
  ).IS_REACT_ACT_ENVIRONMENT = enabled;
}

/**
 * Swaps in the browser APIs jsdom lacks (and Chakra or the workspace use),
 * returning a function that restores the originals. With `immediate`, the
 * ResizeObserver reports each observed element at once, as a first layout would.
 */
export function installDomShims({
  resizeObserver = "noop",
}: { resizeObserver?: "noop" | "immediate" } = {}): () => void {
  const originals = {
    fetch: globalThis.fetch,
    ResizeObserver: globalThis.ResizeObserver,
    structuredClone: globalThis.structuredClone,
    CSS: globalThis.CSS,
    scrollIntoView: HTMLElement.prototype.scrollIntoView,
    scrollTo: HTMLElement.prototype.scrollTo,
  };
  setActEnvironment(true);
  // Chakra clones JSON-compatible recipes.
  globalThis.structuredClone = (value) =>
    value === undefined ? value : JSON.parse(JSON.stringify(value));
  globalThis.CSS = { ...originals.CSS, escape: (value: string) => value };
  HTMLElement.prototype.scrollIntoView = jest.fn();
  HTMLElement.prototype.scrollTo = jest.fn() as never;
  globalThis.ResizeObserver =
    resizeObserver === "immediate"
      ? class {
          constructor(private callback: ResizeObserverCallback) {}
          disconnect() {}
          observe(target: Element) {
            this.callback(
              [{ target } as ResizeObserverEntry],
              this as unknown as ResizeObserver,
            );
          }
          unobserve() {}
        }
      : class {
          disconnect() {}
          observe() {}
          unobserve() {}
        };
  return () => {
    globalThis.fetch = originals.fetch;
    globalThis.ResizeObserver = originals.ResizeObserver;
    globalThis.structuredClone = originals.structuredClone;
    globalThis.CSS = originals.CSS;
    HTMLElement.prototype.scrollIntoView = originals.scrollIntoView;
    HTMLElement.prototype.scrollTo = originals.scrollTo;
    setActEnvironment(false);
  };
}

/** Installs the DOM shims for the whole file. */
export function setupDomShims(
  options?: Parameters<typeof installDomShims>[0],
): void {
  let restore = () => {};
  beforeAll(() => {
    restore = installDomShims(options);
  });
  afterAll(() => restore());
}

/** A React root in a fresh container per test, with query helpers. */
export function setupTestRoot(theme: Theme = defaultSystem) {
  const view = {
    container: null as unknown as HTMLDivElement,
    root: null as unknown as Root,
    /** Wraps a node in the Chakra provider. */
    wrap(node: ReactNode) {
      return <ChakraProvider value={theme}>{node}</ChakraProvider>;
    },
    /** Renders inside the Chakra provider. */
    async render(node: ReactNode): Promise<void> {
      await act(async () => view.root.render(view.wrap(node)));
    },
    byTestId<T extends Element = HTMLElement>(id: string): T | null {
      return view.container.querySelector<T>(`[data-testid="${id}"]`);
    },
    button(label: string): HTMLButtonElement | undefined {
      return [...view.container.querySelectorAll("button")].find(
        (element) => element.textContent?.trim() === label,
      );
    },
    /** A generated sub-question card of the gap form. */
    card(index: number): HTMLElement {
      return view.container.querySelectorAll<HTMLElement>(
        '[data-testid="concept-note-gap-subquestion"]',
      )[index];
    },
    /** The free-text ("Other") field of a gap form card. */
    customField(index: number): HTMLTextAreaElement | null {
      return (
        view
          .card(index)
          ?.querySelector<HTMLTextAreaElement>(
            '[data-testid="concept-note-gap-custom-answer"]',
          ) ?? null
      );
    },
    /** Clicks a card's option: an index, "custom" or "unknown". */
    async pickOption(index: number, value: string): Promise<void> {
      await act(async () =>
        view
          .card(index)
          .querySelector<HTMLInputElement>(`input[value="${value}"]`)!
          .click(),
      );
    },
    /** Types into a card's free-text field. */
    async writeAnswer(index: number, value: string): Promise<void> {
      await typeInto(view.customField(index)!, value);
    },
  };
  beforeEach(() => {
    view.container = document.createElement("div");
    document.body.append(view.container);
    view.root = createRoot(view.container);
  });
  afterEach(async () => {
    await act(async () => view.root.unmount());
    view.container.remove();
  });
  return view;
}

/** Sets a field's value the way React sees typing. */
export async function typeInto(
  field: HTMLTextAreaElement | HTMLInputElement,
  value: string,
): Promise<void> {
  const prototype =
    field instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, "value")!.set!;
  await act(async () => {
    setter.call(field, value);
    field.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

/** Dispatches a cancelable keydown and returns it. */
export async function keyDown(
  target: Element,
  key: string,
  init: KeyboardEventInit = {},
): Promise<KeyboardEvent> {
  const event = new KeyboardEvent("keydown", {
    key,
    bubbles: true,
    cancelable: true,
    ...init,
  });
  await act(async () => {
    target.dispatchEvent(event);
  });
  return event;
}

/** Waits out the gap form's 200 ms debounced question request. */
export async function settle(): Promise<void> {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 250));
  });
}

/** A fetch result as the proxy returns it (only status and body matter). */
export function jsonResponse(body: unknown = {}, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response;
}

/**
 * Real English concept-note strings. `namespaced` loads them under the
 * "concept-notes" namespace, as the app does; otherwise as the default one.
 */
export async function conceptNotesI18n({
  namespaced = false,
}: { namespaced?: boolean } = {}): Promise<I18n> {
  const i18n = createInstance();
  await i18n.init(
    namespaced
      ? {
          lng: "en",
          ns: ["concept-notes"],
          defaultNS: "concept-notes",
          resources: { en: { "concept-notes": translations } },
        }
      : { lng: "en", resources: { en: { translation: translations } } },
  );
  return i18n;
}

/** Mocks the app's translation hook with the given `t`. */
export function mockTranslation(
  t: TFunction | ((key: string, values?: Record<string, unknown>) => string),
  i18n?: I18n,
): void {
  jest.unstable_mockModule("@/i18n/client", () => ({
    useTranslation: () => (i18n ? { t, i18n } : { t }),
  }));
}

/** Stubs the chat surfaces around the composer and gap form. */
export function mockChatPanelSurroundings(): void {
  for (const [path, name] of [
    ["chat-progress", "ChatProgress"],
    ["drafting-progress-card", "DraftingProgressCard"],
    ["chat-welcome", "ChatWelcome"],
  ]) {
    jest.unstable_mockModule(
      `@/components/ConceptNoteWorkspace/${path}`,
      () => ({ [name]: () => null }),
    );
  }
  jest.unstable_mockModule(
    "@/components/ConceptNoteWorkspace/chat-threads",
    () => ({
      ChatThreadSwitcher: () => null,
      OlderChatNotice: () => null,
      useConceptNoteChatThreads: () => ({}),
    }),
  );
}

export function contextPresentation(
  state = "ready",
): ConceptNoteContextPresentation {
  return {
    state,
    blocked: false,
    title: "",
    description: "",
    icon: LuInfo,
    actionIcon: LuInfo,
    actionLabel: "",
    color: "content.secondary",
    surface: "base.light",
  } as unknown as ConceptNoteContextPresentation;
}

export function editControllerStub(): EditController {
  return {
    error: null,
    loadProposal: jest.fn(),
    refresh: jest.fn(),
  } as unknown as EditController;
}

/** An open gap record; fields default from its id. */
export function gapRecord(
  id: string,
  overrides: Partial<ConceptNoteGap> = {},
): ConceptNoteGap {
  return {
    gap_id: id,
    field_key: id,
    question: `Question ${id}?`,
    why_asking: `Because ${id}.`,
    severity: "critical",
    state: "open",
    suggestions: [],
    source_refs: [],
    version: 1,
    resolution: null,
    created_at: "2026-10-15T00:00:00Z",
    updated_at: "2026-10-15T00:00:00Z",
    ...overrides,
  };
}

/** A draft chapter whose open-gap count follows its gaps. */
export function draftChapter(
  overrides: Partial<ConceptNoteDraftChapter> = {},
): ConceptNoteDraftChapter {
  const gaps = overrides.gaps ?? [];
  return {
    chapter_id: "ch-1",
    template_section_id: null,
    title: "Chapter",
    position: 0,
    status: "draft",
    required: true,
    user_locked: false,
    body_markdown: "Body",
    gaps,
    open_gap_count: gaps.filter((gap) => gap.state === "open").length,
    caveat_count: 0,
    revision_number: 1,
    confirmed_body_markdown: null,
    confirmed_revision_number: null,
    ...overrides,
  };
}

/** The recorded financing gap the gap-form tests answer. */
export function financingGapRequest({
  chapterTitle = "Financing plan",
  question = "What is the requested instrument?",
  whyAsking = "The funder needs the type of support.",
  gap = {},
}: {
  chapterTitle?: string;
  question?: string;
  whyAsking?: string;
  gap?: Partial<ConceptNoteGap>;
} = {}): GapAnswerRequest {
  return {
    chapterId: "financing-chapter",
    chapterTitle,
    row: {
      id: "financing-gap",
      question,
      whyAsking,
      severity: "critical",
      gap: gapRecord("financing-gap", {
        field_key: "financing_instrument",
        question,
        why_asking: whyAsking,
        ...gap,
      }),
    },
  };
}
