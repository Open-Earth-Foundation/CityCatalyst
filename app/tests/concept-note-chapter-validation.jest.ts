import { describe, expect, it } from "@jest/globals";

import {
  buildDocumentReviewSummary,
  getChapterDisplayStatus,
  getChapterReviewErrorKind,
  groupChapterValidationFindings,
} from "@/components/ConceptNoteWorkspace/chapter-validation";
import type {
  ConceptNoteChapterValidation,
  ConceptNoteChapterValidationFinding,
  ConceptNoteDraftChapter,
} from "@/util/types";

const finding: ConceptNoteChapterValidationFinding = {
  category: "missing_information",
  involved_chapter_ids: ["chapter-1"],
  message: "A required date is missing.",
  phase: "completeness",
  severity: "blocking",
  suggested_action: "Add the start date.",
};

function validation(
  overrides: Partial<ConceptNoteChapterValidation> = {},
): ConceptNoteChapterValidation {
  return {
    checks: [],
    findings: [],
    is_stale: false,
    status: "ready",
    validated_at: "2026-08-28T12:00:00Z",
    validated_revision_number: 1,
    ...overrides,
  };
}

function chapter(
  result: ConceptNoteChapterValidation | null = null,
  id = "chapter-1",
): ConceptNoteDraftChapter {
  return {
    body_markdown: "Draft body",
    chapter_id: id,
    missing_information: [],
    position: 0,
    required: true,
    revision_number: 1,
    status: "draft",
    template_section_id: "summary",
    title: id,
    user_locked: false,
    validation: result,
  };
}

describe("chapter-validation presentation", () => {
  it("classifies template and service failures", () => {
    expect(
      getChapterReviewErrorKind({
        status: 409,
        data: { code: "chapter_validation_template_unavailable" },
      }),
    ).toBe("template_unavailable");
    expect(getChapterReviewErrorKind({ status: 503 })).toBe(
      "service_unavailable",
    );
    expect(getChapterReviewErrorKind({ status: 400 })).toBe("generic");
  });

  it.each([
    [validation({ status: "ready" }), "ready"],
    [validation({ status: "incomplete" }), "incomplete"],
    [validation({ is_stale: true }), "stale"],
    [validation({ validated_revision_number: 2 }), "stale"],
  ] as const)("maps validation state to %s", (result, expected) => {
    expect(getChapterDisplayStatus(chapter(result))).toBe(expected);
  });

  it("groups findings and deduplicates a symmetric conflict", () => {
    const conflict = {
      ...finding,
      category: "cross_chapter_conflict",
      involved_chapter_ids: ["chapter-1", "chapter-2"],
      phase: "consistency" as const,
    };
    expect(groupChapterValidationFindings([finding, conflict])).toMatchObject({
      missing_information: [finding],
      conflicts_logic: [conflict],
    });

    const review = buildDocumentReviewSummary([
      {
        chapter: chapter(),
        validation: validation({ findings: [conflict], status: "incomplete" }),
      },
      {
        chapter: chapter(null, "chapter-2"),
        validation: validation({
          findings: [
            { ...conflict, involved_chapter_ids: ["chapter-2", "chapter-1"] },
          ],
          status: "incomplete",
        }),
      },
    ]);

    expect(review.blockingCount).toBe(1);
    expect(review.groups.conflicts_logic).toHaveLength(1);
  });
});
