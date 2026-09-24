/** @jest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, jest } from "@jest/globals";
import { ChakraProvider } from "@chakra-ui/react";
import { appTheme } from "@/lib/theme/recipes/app-theme";
import type { ConceptNoteDraftState } from "@/util/types";

const t = (key: string, values?: Record<string, unknown>) =>
  values ? `${key}:${JSON.stringify(values)}` : key;
jest.unstable_mockModule("@/i18n/client", () => ({
  useTranslation: () => ({ t }),
}));

const { DraftingProgressCard, isDraftingInProgress } =
  await import("@/components/ConceptNoteWorkspace/drafting-progress-card");

let root: Root;
let container: HTMLDivElement;

function chapter(
  id: string,
  position: number,
  status: ConceptNoteDraftState["chapters"][number]["status"],
  body: string | null,
): ConceptNoteDraftState["chapters"][number] {
  return {
    chapter_id: id,
    template_section_id: null,
    title: `Chapter ${id}`,
    position,
    status,
    required: true,
    user_locked: false,
    body_markdown: body,
    gaps: [],
    open_gap_count: 0,
    caveat_count: 0,
    revision_number: body ? 1 : null,
    confirmed_body_markdown: null,
    confirmed_revision_number: null,
  };
}

function draft(
  overrides: Partial<ConceptNoteDraftState> = {},
): ConceptNoteDraftState {
  return {
    run_id: "run",
    status: "running",
    completed_chapters: 1,
    total_chapters: 3,
    current_chapter_id: "b",
    error_code: null,
    chapters: [
      chapter("c", 3, "empty", null),
      chapter("a", 1, "draft", "Written"),
      chapter("b", 2, "empty", null),
    ],
    ...overrides,
  };
}

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  globalThis.structuredClone = (value) => JSON.parse(JSON.stringify(value));
  jest.useFakeTimers({ now: new Date("2026-09-24T10:01:30Z") });
  container = document.createElement("div");
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  jest.useRealTimers();
  globalThis.IS_REACT_ACT_ENVIRONMENT = false;
});

async function render(
  state: ConceptNoteDraftState,
  startedAt?: string,
  completedAt?: string,
) {
  await act(async () =>
    root.render(
      <ChakraProvider value={appTheme}>
        <DraftingProgressCard
          draft={state}
          lng="en"
          startedAt={startedAt}
          completedAt={completedAt}
        />
      </ChakraProvider>,
    ),
  );
}

it("lists chapters in order with done, current and pending states while drafting", async () => {
  await render(draft(), "2026-09-24T10:00:00Z");
  const card = container.querySelector(
    '[data-testid="concept-note-drafting-card"]',
  );
  expect(card).not.toBeNull();
  expect(card?.textContent).toContain("drafting-card-title");
  expect(
    container.querySelector('[data-testid="concept-note-drafting-progress"]')
      ?.textContent,
  ).toBe('drafting-card-progress:{"completed":1,"total":3} · 1:30');
  const rows = Array.from(
    container.querySelectorAll(
      '[data-testid="concept-note-drafting-chapters"] li',
    ),
  );
  expect(rows.map((row) => row.getAttribute("data-state"))).toEqual([
    "done",
    "current",
    "pending",
  ]);
  expect(rows[1]?.textContent).toContain("drafting-card-writing");
  expect(
    container
      .querySelector('[role="progressbar"]')
      ?.getAttribute("aria-valuenow"),
  ).toBe("1");
});

it("shows the summarising state once chapters are complete but the overview is pending", async () => {
  await render(
    draft({
      status: "complete",
      completed_chapters: 3,
      current_chapter_id: null,
      overview_pending: true,
    }),
    "2026-09-24T10:00:00Z",
    "2026-09-24T10:00:45Z",
  );
  expect(container.textContent).toContain("drafting-card-summarising-title");
  // The clock freezes at the drafting end time, not "now".
  expect(
    container.querySelector('[data-testid="concept-note-drafting-progress"]')
      ?.textContent,
  ).toBe("drafting-card-summarising · 0:45");
  const rows = Array.from(
    container.querySelectorAll(
      '[data-testid="concept-note-drafting-chapters"] li',
    ),
  );
  expect(rows.map((row) => row.getAttribute("data-state"))).toEqual([
    "done",
    "done",
    "done",
  ]);
});

it("renders nothing when drafting is not in progress", async () => {
  await render(draft({ status: "complete", overview_pending: false }));
  expect(container.textContent).toBe("");
  await render(draft({ status: "not_started" }));
  expect(container.textContent).toBe("");
  expect(isDraftingInProgress(null)).toBe(false);
  expect(isDraftingInProgress({ status: "failed" })).toBe(false);
  expect(isDraftingInProgress({ status: "running" })).toBe(true);
});
