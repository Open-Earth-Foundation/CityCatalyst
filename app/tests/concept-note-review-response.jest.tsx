import { jest, describe, expect, test } from "@jest/globals";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ChakraProvider, defaultSystem } from "@chakra-ui/react";
import type { EditProposal } from "@/util/concept-note-edit-types";
import type { EditController } from "@/components/ConceptNoteWorkspace/document-review";

jest.unstable_mockModule("@/i18n/client", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
const { DocumentReviewToolbar, editFeedbackKey, selectReviewProposal } =
  await import("@/components/ConceptNoteWorkspace/document-review");

function proposal(status: EditProposal["status"]): EditProposal {
  return {
    proposal_id: status,
    run_id: "run",
    instruction: "Update the budget",
    scope: { kind: "auto" },
    status,
    base_revisions: {},
    changes: [],
    clarification:
      status === "clarification_required"
        ? "Which currency should the budget use?"
        : null,
    error_code: status === "failed" ? "planner_unavailable" : null,
    result: null,
    created_at: "2026-09-07T12:00:00Z",
    updated_at: "2026-09-07T12:00:00Z",
  };
}

describe("recoverable proposal responses", () => {
  test.each([
    "clarification_required",
    "failed",
    "stale",
    "processing",
  ] as const)(
    "shows a new %s response ahead of the older proposal, including after reload",
    (status) => {
      const restored = JSON.parse(
        JSON.stringify([proposal(status), proposal("proposed")]),
      );
      const selected = selectReviewProposal(restored)!;
      expect(selected.status).toBe(status);
      const html = renderToStaticMarkup(
        createElement(
          ChakraProvider,
          { value: defaultSystem },
          createElement(DocumentReviewToolbar, {
            proposal: selected,
            chapters: [],
            changes: [],
            lng: "en",
            edits: {
              busy: null,
              apply: async () => {},
              reject: async () => {},
              refine: async () => {},
            } as unknown as EditController,
            onNavigate: () => {},
            onOpenSources: () => {},
          }),
        ),
      );
      expect(html).toContain(`edit-status-${status}`);
      expect(html).not.toContain("edit-inline-stale");
      if (status === "clarification_required")
        expect(html).toContain("Which currency should the budget use?");
      if (status === "failed") expect(html).toContain("edit-retry-hint");
      expect(html).toContain(
        status === "processing"
          ? "concept-note-edit-cancel"
          : "concept-note-edit-dismiss",
      );
    },
  );
  test("dismissed and completed responses do not hide the remaining proposal", () => {
    expect(
      selectReviewProposal([
        proposal("rejected"),
        proposal("applied"),
        proposal("proposed"),
      ])?.status,
    ).toBe("proposed");
    expect(
      selectReviewProposal([proposal("rejected"), proposal("applied")]),
    ).toBeUndefined();
  });
});

describe("edit feedback key", () => {
  const edits = (state: Partial<EditController>) =>
    ({ error: null, needsDraftReload: false, ...state }) as EditController;
  test("maps edit failures to the same message in toolbar and dialog", () => {
    expect(editFeedbackKey(edits({}))).toBeNull();
    expect(editFeedbackKey(edits({ error: "stale_base" }))).toBe(
      "edit-stale-hint",
    );
    expect(editFeedbackKey(edits({ error: "storage_unavailable" }))).toBe(
      "edit-request-error",
    );
    expect(
      editFeedbackKey(edits({ error: "stale_base", needsDraftReload: true })),
    ).toBe("edit-draft-reload-hint");
  });
});
