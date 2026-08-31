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

export type ChapterReviewErrorKind =
  | "draft_unavailable"
  | "generic"
  | "service_unavailable"
  | "template_unavailable";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function getChapterReviewErrorKind(
  error: unknown,
): ChapterReviewErrorKind {
  const payload = isRecord(error) && isRecord(error.data) ? error.data : error;
  if (
    isRecord(payload) &&
    payload.code === "chapter_validation_template_unavailable"
  ) {
    return "template_unavailable";
  }
  const status = isRecord(error) ? error.status : null;
  if (
    status === "FETCH_ERROR" ||
    status === "TIMEOUT_ERROR" ||
    (typeof status === "number" && (status === 429 || status >= 500))
  ) {
    return "service_unavailable";
  }
  return "generic";
}

export function getChapterDisplayStatus(
  chapter: ConceptNoteDraftChapter,
): ChapterDisplayStatus {
  if (chapter.validation && !isChapterValidationCurrent(chapter)) {
    return "stale";
  }
  return chapter.validation?.status ?? chapter.status;
}

export function isChapterValidationCurrent(
  chapter: ConceptNoteDraftChapter,
): boolean {
  return Boolean(
    chapter.validation &&
    !chapter.validation.is_stale &&
    chapter.validation.validated_revision_number === chapter.revision_number,
  );
}

export function chapterValidationFindingGroup(
  finding: ConceptNoteChapterValidationFinding,
): ChapterValidationFindingGroup {
  const category = finding.category.toLowerCase();
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
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

export function chapterValidationFindingKey(
  chapterId: string,
  finding: ConceptNoteChapterValidationFinding,
): string {
  const involvedChapters = [...finding.involved_chapter_ids].sort().join("|");
  return [
    chapterValidationFindingGroup(finding),
    finding.category.toLowerCase(),
    involvedChapters || chapterId,
    normalizedFindingText(finding.message),
  ].join("::");
}

function documentFindingKey(entry: DocumentReviewFinding): string {
  return chapterValidationFindingKey(entry.chapterId, entry.finding);
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
