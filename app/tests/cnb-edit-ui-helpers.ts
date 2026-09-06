import { act, createElement, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import translations from "@/i18n/locales/en/concept-notes.json";
import type {
  EditHistoryEntry,
  EditProposal,
} from "@/util/concept-note-edit-types";
import type { ConceptNoteDraftChapter } from "@/util/types";

export const runId = "11111111-1111-4111-8111-111111111111";
export const chapterId = "33333333-3333-4333-8333-333333333333";
export function draftChapter(
  overrides: Partial<ConceptNoteDraftChapter> = {},
): ConceptNoteDraftChapter {
  return {
    chapter_id: chapterId,
    template_section_id: "summary",
    title: "Summary",
    position: 0,
    status: "ready",
    required: true,
    user_locked: false,
    body_markdown: "Existing park.",
    gaps: [],
    open_gap_count: 0,
    caveat_count: 0,
    revision_number: 1,
    confirmed_body_markdown: "Existing park.",
    confirmed_revision_number: 1,
    proposed_revision_number: null,
    regeneration_status: "idle",
    regeneration_error: null,
    ...overrides,
  };
}
export const proposal: EditProposal = {
  proposal_id: "22222222-2222-4222-8222-222222222222",
  run_id: runId,
  instruction: "Make the opening more concise",
  status: "proposed",
  scope: {
    kind: "auto",
  },
  base_revisions: { [chapterId]: 1 },
  changes: [
    {
      change_id: "44444444-4444-4444-8444-444444444444",
      chapter_id: chapterId,
      chapter_title: "Summary",
      base_revision: 1,
      start: 0,
      before: "The project builds parks.",
      after: "The project creates greener parks.",
      kind: "wording",
      group_id: "clarity",
      source_refs: [],
      user_input_quote: null,
    },
  ],
  clarification: null,
  error_code: null,
  result: null,
  created_at: "2026-08-30T12:00:00Z",
  updated_at: "2026-08-30T12:00:00Z",
};

export const historyEntry: EditHistoryEntry = {
  application_id: "77777777-7777-4777-8777-777777777777",
  run_id: runId,
  proposal_id: proposal.proposal_id,
  restores_application_id: null,
  sequence: 1,
  operation: "apply",
  before_revisions: { [chapterId]: 1 },
  after_revisions: { [chapterId]: 2 },
  accepted_change_ids: [proposal.changes[0].change_id],
  created_at: proposal.created_at,
  chapters: [
    {
      chapter_id: chapterId,
      chapter_title: "Summary",
      before: proposal.changes[0].before,
      after: proposal.changes[0].after,
    },
  ],
};

export function t(key: string, values: Record<string, unknown> = {}): string {
  const pluralKey =
    typeof values.count === "number"
      ? `${key}_${values.count === 1 ? "one" : "other"}`
      : key;
  let result =
    (translations as Record<string, string>)[pluralKey] ??
    (translations as Record<string, string>)[key] ??
    key;
  for (const [name, value] of Object.entries(values))
    result = result.replaceAll(`{{${name}}}`, String(value));
  return result;
}

export function prepareDom(): void {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  // jsdom has no layout observer; Floating UI uses it only to reposition overlays.
  if (!globalThis.ResizeObserver)
    Object.assign(globalThis, {
      ResizeObserver: class {
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    });
  if (!globalThis.structuredClone)
    Object.assign(globalThis, {
      structuredClone: (value: unknown) => JSON.parse(JSON.stringify(value)),
    });
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: () => ({
      matches: false,
      addEventListener() {},
      removeEventListener() {},
    }),
  });
}

export async function mount(
  node: ReactNode,
  themed = false,
): Promise<{ root: Root; container: HTMLDivElement }> {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  let content = node;
  if (themed) {
    const { ChakraProvider } = await import("@chakra-ui/react");
    const { appTheme } = await import("@/lib/theme/recipes/app-theme");
    content = createElement(ChakraProvider, { value: appTheme }, node);
  }
  await act(async () => root.render(content));
  return { root, container };
}

export async function cleanup(root?: Root): Promise<void> {
  if (root) await act(async () => root.unmount());
  document.body.innerHTML = "";
}
