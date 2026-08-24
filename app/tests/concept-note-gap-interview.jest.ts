import { describe, expect, it } from "@jest/globals";

import {
  getGapInterviewPresentation,
  getGapSummaryQuestions,
  getOpenConceptNoteGaps,
} from "@/components/ConceptNoteWorkspace/gap-interview";
import type { ConceptNoteGap } from "@/util/types";

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
});
