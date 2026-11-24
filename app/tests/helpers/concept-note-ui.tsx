// Shared setup for the concept-note workspace component tests (jsdom).
// Call the setup* helpers at the top level of a test file: they register the
// Jest hooks themselves. Module mocks must still be registered before the
// test file's dynamic import of the component under test.
import { afterEach, beforeAll, beforeEach, jest } from "@jest/globals";
import { ChakraProvider, defaultSystem } from "@chakra-ui/react";
import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { createInstance, type i18n as I18n, type TFunction } from "i18next";
import translations from "@/i18n/locales/en/concept-notes.json";
import type { ConceptNoteGap } from "@/util/types";

type Theme = Parameters<typeof ChakraProvider>[0]["value"];

/** Each Jest suite owns its jsdom window. Install only the missing browser behavior. */
export function setupDomShims(): void {
  beforeAll(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    globalThis.structuredClone = (value) =>
      value === undefined ? value : JSON.parse(JSON.stringify(value));
    globalThis.CSS = { ...globalThis.CSS, escape: (value: string) => value };
    HTMLElement.prototype.scrollIntoView = jest.fn();
    HTMLElement.prototype.scrollTo = jest.fn() as never;
    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  });
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

export async function conceptNotesI18n(): Promise<I18n> {
  const i18n = createInstance();
  await i18n.init({
    lng: "en",
    defaultNS: "concept-notes",
    resources: { en: { "concept-notes": translations } },
  });
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
