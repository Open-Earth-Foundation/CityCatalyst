import type { ConceptNoteGap } from "@/util/types";

export type GapInterviewPresentation = "hidden" | "summary" | "question";

export function getGapInterviewPresentation(
  openGapCount: number,
  interviewActive: boolean,
): GapInterviewPresentation {
  if (openGapCount === 0) {
    return "hidden";
  }

  return interviewActive ? "question" : "summary";
}

export function getOpenConceptNoteGaps(
  gaps: ConceptNoteGap[],
): ConceptNoteGap[] {
  return gaps.filter((gap) => gap.state === "open");
}

export function getGapSummaryQuestions(
  gaps: ConceptNoteGap[],
  limit = 2,
): string {
  return gaps
    .slice(0, limit)
    .map((gap) => gap.question.trim())
    .join(" · ");
}
