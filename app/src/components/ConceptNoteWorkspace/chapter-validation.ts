import type {
  ConceptNoteChapterValidation,
  ConceptNoteChapterValidationFinding,
  ConceptNoteDraftChapter,
} from "@/util/types";

export type ChapterDisplayStatus =
  ConceptNoteDraftChapter["status"] | "incomplete" | "stale";

export type ChapterValidationFindingGroup =
  "missing_information" | "conflicts_logic" | "evidence";

export type GroupedChapterValidationFindings = Record<
  ChapterValidationFindingGroup,
  ConceptNoteChapterValidationFinding[]
>;

export interface ReviewedConceptNoteChapter {
  chapter: ConceptNoteDraftChapter;
  validation: ConceptNoteChapterValidation;
}

export interface DocumentReviewFinding {
  chapterId: string;
  chapterTitle: string;
  finding: ConceptNoteChapterValidationFinding;
}

export interface DocumentReviewSummary {
  blockingCount: number;
  evidenceCount: number;
  groups: Record<ChapterValidationFindingGroup, DocumentReviewFinding[]>;
  status: ConceptNoteChapterValidation["status"];
  templateFailureCount: number;
  warningCount: number;
}

export function getChapterDisplayStatus(
  chapter: ConceptNoteDraftChapter,
): ChapterDisplayStatus {
  if (chapter.validation?.is_stale) {
    return "stale";
  }
  return chapter.validation?.status ?? chapter.status;
}

export function chapterValidationFindingGroup(
  finding: ConceptNoteChapterValidationFinding,
): ChapterValidationFindingGroup {
  const category = finding.category.toLocaleLowerCase();
  if (
    finding.phase === "evidence" ||
    category.includes("evidence") ||
    category.includes("citation") ||
    category.includes("source")
  ) {
    return "evidence";
  }
  if (
    finding.phase === "consistency" ||
    category.includes("conflict") ||
    category.includes("logic") ||
    category.includes("consistency") ||
    category.includes("contradiction")
  ) {
    return "conflicts_logic";
  }
  return "missing_information";
}

export function groupChapterValidationFindings(
  findings: ConceptNoteChapterValidationFinding[],
): GroupedChapterValidationFindings {
  const groups: GroupedChapterValidationFindings = {
    missing_information: [],
    conflicts_logic: [],
    evidence: [],
  };
  for (const finding of findings) {
    groups[chapterValidationFindingGroup(finding)].push(finding);
  }
  return groups;
}

function normalizedFindingText(value: string): string {
  return value
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function documentFindingKey(entry: DocumentReviewFinding): string {
  const involvedChapters = [...entry.finding.involved_chapter_ids]
    .sort()
    .join("|");
  return [
    chapterValidationFindingGroup(entry.finding),
    entry.finding.category.toLocaleLowerCase(),
    involvedChapters || entry.chapterId,
    normalizedFindingText(entry.finding.message),
  ].join("::");
}

export function buildDocumentReviewSummary(
  reviewedChapters: ReviewedConceptNoteChapter[],
): DocumentReviewSummary {
  const groups: DocumentReviewSummary["groups"] = {
    missing_information: [],
    conflicts_logic: [],
    evidence: [],
  };
  const findingKeys = new Set<string>();

  for (const reviewedChapter of reviewedChapters) {
    for (const finding of reviewedChapter.validation.findings) {
      const entry: DocumentReviewFinding = {
        chapterId: reviewedChapter.chapter.chapter_id,
        chapterTitle: reviewedChapter.chapter.title,
        finding,
      };
      const key = documentFindingKey(entry);
      if (findingKeys.has(key)) {
        continue;
      }
      findingKeys.add(key);
      groups[chapterValidationFindingGroup(finding)].push(entry);
    }
  }

  const allFindings = Object.values(groups).flat();
  const hasIncomplete = reviewedChapters.some(
    ({ validation }) => validation.status === "incomplete",
  );
  const hasWarning = reviewedChapters.some(
    ({ validation }) => validation.status === "needs_review",
  );

  return {
    blockingCount: allFindings.filter(
      ({ finding }) => finding.severity === "blocking",
    ).length,
    evidenceCount: groups.evidence.length,
    groups,
    status: hasIncomplete
      ? "incomplete"
      : hasWarning
        ? "needs_review"
        : "ready",
    templateFailureCount: reviewedChapters.filter(({ validation }) =>
      validation.checks.some(
        (check) =>
          check.key === "template_constraints" && check.status === "fail",
      ),
    ).length,
    warningCount: allFindings.filter(
      ({ finding }) => finding.severity === "warning",
    ).length,
  };
}
