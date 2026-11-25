/** @jest-environment jsdom */

import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";
import { act } from "react";
import { ChakraProvider, defaultSystem } from "@chakra-ui/react";
import { createRoot, type Root } from "react-dom/client";
import type { EditChange, EditProposal } from "@/util/concept-note-edit-types";
import type { ConceptNotePreview } from "@/util/types";

const usePreview = jest.fn<() => unknown>();

jest.unstable_mockModule("@/i18n/client", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
jest.unstable_mockModule("@/services/api", () => ({
  api: { useGetConceptNotePreviewQuery: usePreview },
}));

let ConceptNoteCollaboratorPreview: typeof import("@/components/ConceptNoteWorkspace/collaborator-preview").ConceptNoteCollaboratorPreview;
let container: HTMLDivElement;
let root: Root;

const change = (id: string, after: string): EditChange => ({
  change_id: id,
  chapter_id: "chapter-1",
  chapter_title: "Implementation",
  base_revision: 1,
  start: 0,
  before: "[Information needed: Confirm the lead partner.]",
  after,
  kind: "factual",
  group_id: id,
  source_refs: [],
  user_input_quote: after,
});
const proposal = (
  id: string,
  status: EditProposal["status"],
  changes: EditChange[],
  accepted: string[] = [],
): EditProposal => ({
  proposal_id: id,
  run_id: "run-1",
  instruction: `Instruction ${id}`,
  scope: { kind: "auto" },
  status,
  base_revisions: {},
  changes,
  clarification: null,
  error_code: null,
  result: accepted.length
    ? { application_id: "app", accepted_change_ids: accepted, revisions: {} }
    : null,
  created_at: "2026-11-24T10:00:00Z",
  updated_at: "2026-11-24T10:00:00Z",
});

const preview = {
  run_id: "run-1",
  name: "Lincoln Park cooling",
  city_id: "city-1",
  draft: {
    run_id: "run-1",
    status: "ready",
    completed_chapters: 1,
    total_chapters: 1,
    current_chapter_id: null,
    error_code: null,
    chapters: [
      {
        chapter_id: "chapter-1",
        template_section_id: null,
        title: "Implementation",
        position: 0,
        status: "needs_review",
        required: true,
        user_locked: false,
        body_markdown: "The council leads delivery.",
        gaps: [
          {
            gap_id: "gap-1",
            field_key: "budget",
            question: "Confirm the delivery budget.",
            why_asking: "Funders need it.",
            severity: "critical",
            state: "open",
            suggestions: [],
            source_refs: [],
            version: 2,
            resolution: null,
            answered_so_far: "USD 2 million",
            created_at: "2026-11-24T10:00:00Z",
            updated_at: "2026-11-24T10:00:00Z",
          },
        ],
        open_gap_count: 1,
        caveat_count: 0,
        revision_number: 2,
        confirmed_body_markdown: null,
        confirmed_revision_number: null,
      },
    ],
  },
  proposals: [
    proposal(
      "p1",
      "partially_applied",
      [change("c1", "The council leads."), change("c2", "A trust leads.")],
      ["c1"],
    ),
    proposal("p2", "proposed", [change("c3", "The city leads.")]),
  ],
} as unknown as ConceptNotePreview;

function render() {
  act(() => {
    root.render(
      <ChakraProvider value={defaultSystem}>
        <ConceptNoteCollaboratorPreview
          cityId="city-1"
          lng="en"
          runId="run-1"
        />
      </ChakraProvider>,
    );
  });
}

beforeAll(async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  globalThis.structuredClone = (value) =>
    value === undefined ? value : JSON.parse(JSON.stringify(value));
  ({ ConceptNoteCollaboratorPreview } =
    await import("@/components/ConceptNoteWorkspace/collaborator-preview"));
});

describe("ConceptNoteCollaboratorPreview", () => {
  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });
  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("shows saved answers and which proposed changes were applied, read-only", () => {
    usePreview.mockReturnValue({ data: preview, isLoading: false });
    render();

    expect(container.textContent).toContain("preview-read-only");
    expect(
      container.querySelector(
        "[data-testid='concept-note-preview-saved-answers']",
      )?.textContent,
    ).toContain("USD 2 million");
    const states = [
      ...container.querySelectorAll(
        "[data-testid='concept-note-preview-change-state']",
      ),
    ].map((badge) => badge.textContent);
    expect(states).toEqual([
      "preview-change-applied",
      "preview-change-not-applied",
      "preview-change-pending",
    ]);
    expect(container.textContent).toContain("A trust leads.");
    // No save, accept or reject control; marker info tooltips are the only buttons.
    expect(
      container.querySelectorAll(
        "button:not([data-testid='concept-note-missing-information']), textarea, input",
      ),
    ).toHaveLength(0);
  });

  it("offers only the way back when the note is not visible to this user", () => {
    usePreview.mockReturnValue({
      data: undefined,
      error: { status: 404 },
      isLoading: false,
      refetch: jest.fn(),
    });
    render();

    expect(container.textContent).toContain("workspace-load-error-title");
    expect(container.textContent).toContain("all-concept-notes");
  });
});
