import type { ConceptNoteDraftChapter, ConceptNoteGap } from "@/util/types";

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

export function getFocusedConceptNoteGap(
  chapters: ConceptNoteDraftChapter[],
  focusedGapId: string | null | undefined,
  preferredGapId: string | null | undefined,
  preferredChapterId: string | null | undefined,
): ConceptNoteGap | null {
  const allGaps = chapters.flatMap((chapter) => chapter.gaps);
  const preferredGap = allGaps.find(
    (gap) => gap.gap_id === preferredGapId && gap.state === "open",
  );
  if (preferredGap) {
    return preferredGap;
  }

  const preferredChapterGap = chapters
    .find((chapter) => chapter.chapter_id === preferredChapterId)
    ?.gaps.find((gap) => gap.state === "open");
  if (preferredChapterGap) {
    return preferredChapterGap;
  }

  const serverFocusedGap = allGaps.find(
    (gap) => gap.gap_id === focusedGapId && gap.state === "open",
  );
  return serverFocusedGap ?? getOpenConceptNoteGaps(allGaps)[0] ?? null;
}

export function getConceptNoteGapForMarker(
  chapter: ConceptNoteDraftChapter,
  markerMessage: string,
): ConceptNoteGap | null {
  const question = markerMessage
    .replace(/^Information needed:\s*/i, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase();
  return (
    chapter.gaps.find(
      (gap) =>
        gap.state === "open" &&
        gap.question.replace(/\s+/g, " ").trim().toLocaleLowerCase() ===
          question,
    ) ?? null
  );
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
