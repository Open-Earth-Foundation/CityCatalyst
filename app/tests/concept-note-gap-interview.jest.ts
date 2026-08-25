import { describe, expect, it } from "@jest/globals";

import {
  getConceptNoteGapForMarker,
  getFocusedConceptNoteGap,
  getGapInterviewPresentation,
  getGapSummaryQuestions,
  getOpenConceptNoteGaps,
} from "@/components/ConceptNoteWorkspace/gap-interview";
import type { ConceptNoteDraftChapter, ConceptNoteGap } from "@/util/types";

function gap(
  gapId: string,
  question: string,
  state: ConceptNoteGap["state"],
): ConceptNoteGap {
  return {
    gap_id: gapId,
    field_key: gapId,
    question,
    why_asking: "Required by the funder.",
    severity: "critical",
    state,
    suggestions: [],
    source_refs: [],
    version: 1,
    resolution: null,
    created_at: "2026-08-25T10:00:00Z",
    updated_at: "2026-08-25T10:00:00Z",
  };
}

function chapter(
  chapterId: string,
  position: number,
  gaps: ConceptNoteGap[],
): ConceptNoteDraftChapter {
  return {
    chapter_id: chapterId,
    template_section_id: null,
    title: `Chapter ${position + 1}`,
    position,
    status: gaps.some((item) => item.state === "open")
      ? "needs_review"
      : "draft",
    required: true,
    user_locked: false,
    body_markdown: null,
    gaps,
    open_gap_count: gaps.filter((item) => item.state === "open").length,
    caveat_count: gaps.filter((item) => item.state === "caveat").length,
    revision_number: 1,
    confirmed_body_markdown: null,
    confirmed_revision_number: null,
    proposed_revision_number: null,
    regeneration_status: "idle",
    regeneration_error: null,
  };
}

describe("Concept Note gap interview presentation", () => {
  it("shows the summary until the interview is explicitly started", () => {
    expect(getGapInterviewPresentation(2, false)).toBe("summary");
    expect(getGapInterviewPresentation(2, true)).toBe("question");
  });

  it("hides the interview surfaces when there are no open gaps", () => {
    expect(getGapInterviewPresentation(0, false)).toBe("hidden");
    expect(getGapInterviewPresentation(0, true)).toBe("hidden");
  });

  it("summarizes only actionable open gaps in their chapter order", () => {
    const gaps = [
      gap("partners", "Who are the confirmed partners?", "open"),
      gap("budget", "What is the match-funding amount?", "open"),
      gap("timeline", "When will delivery begin?", "resolved"),
    ];

    const openGaps = getOpenConceptNoteGaps(gaps);

    expect(openGaps.map((item) => item.gap_id)).toEqual(["partners", "budget"]);
    expect(getGapSummaryQuestions(openGaps)).toBe(
      "Who are the confirmed partners? · What is the match-funding amount?",
    );
  });

  it("focuses the first open gap in the chapter selected from the draft", () => {
    const chapters = [
      chapter("summary", 0, [
        gap("summary-gap", "What is the project value?", "open"),
      ]),
      chapter("implementation", 5, [
        gap("resolved-owner", "Who owned delivery?", "resolved"),
        gap("delivery-gap", "Who is responsible for delivery?", "open"),
        gap("timeline-gap", "What is the commissioning date?", "open"),
      ]),
    ];

    expect(
      getFocusedConceptNoteGap(chapters, "summary-gap", null, "implementation")
        ?.gap_id,
    ).toBe("delivery-gap");
  });

  it("falls back to the server-focused gap when the selected chapter is complete", () => {
    const chapters = [
      chapter("summary", 0, [
        gap("summary-gap", "What is the project value?", "open"),
      ]),
      chapter("implementation", 5, [
        gap("resolved-owner", "Who owned delivery?", "resolved"),
      ]),
    ];

    expect(
      getFocusedConceptNoteGap(chapters, "summary-gap", null, "implementation")
        ?.gap_id,
    ).toBe("summary-gap");
  });

  it("focuses the exact open gap selected from an inline information marker", () => {
    const implementation = chapter("implementation", 5, [
      gap("delivery-gap", "Who is responsible for delivery?", "open"),
      gap("timeline-gap", "What is the commissioning date?", "open"),
    ]);

    const selectedGap = getConceptNoteGapForMarker(
      implementation,
      "Information needed: What is the commissioning date?",
    );

    expect(selectedGap?.gap_id).toBe("timeline-gap");
    expect(
      getFocusedConceptNoteGap(
        [implementation],
        "delivery-gap",
        selectedGap?.gap_id,
        implementation.chapter_id,
      )?.gap_id,
    ).toBe("timeline-gap");
  });
});
