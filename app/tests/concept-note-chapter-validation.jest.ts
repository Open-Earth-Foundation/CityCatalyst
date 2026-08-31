import { describe, expect, it } from "@jest/globals";

import {
  buildDocumentReviewSummary,
  getChapterReviewErrorKind,
  getChapterDisplayStatus,
  groupChapterValidationFindings,
} from "@/components/ConceptNoteWorkspace/chapter-validation";
import type {
  ConceptNoteChapterValidation,
  ConceptNoteChapterValidationFinding,
  ConceptNoteDraftChapter,
} from "@/util/types";

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
  chapterValidation?: ConceptNoteChapterValidation | null,
): ConceptNoteDraftChapter {
  return {
    body_markdown: "Draft body",
    chapter_id: "chapter-target",
    missing_information: [],
    position: 0,
    required: true,
    revision_number: 1,
    status: "draft",
    template_section_id: "summary",
    title: "Project summary",
    user_locked: false,
    validation: chapterValidation,
  };
}

function finding(
  overrides: Partial<ConceptNoteChapterValidationFinding>,
): ConceptNoteChapterValidationFinding {
  return {
    category: "required_content",
    involved_chapter_ids: ["chapter-target"],
    message: "A required date is missing.",
    phase: "completeness",
    severity: "blocking",
    suggested_action: "Add the programme start date.",
    ...overrides,
  };
}

describe("Concept Note chapter-validation presentation", () => {
  it("distinguishes a missing application template from generic review failures", () => {
    expect(
      getChapterReviewErrorKind({
        status: 409,
        data: {
          code: "chapter_validation_template_unavailable",
          detail: "The selected application template is unavailable",
        },
      }),
    ).toBe("template_unavailable");
    expect(getChapterReviewErrorKind({ status: 503 })).toBe("generic");
  });

  it.each([
    [undefined, "draft"],
    [validation({ status: "ready" }), "ready"],
    [validation({ status: "needs_review" }), "needs_review"],
    [validation({ status: "incomplete" }), "incomplete"],
    [validation({ is_stale: true, status: "ready" }), "stale"],
  ] as const)("presents validation %p as %s", (result, expected) => {
    expect(getChapterDisplayStatus(chapter(result))).toBe(expected);
  });

  it("groups completeness, consistency, and evidence findings for the UI", () => {
    const completeness = finding({});
    const consistency = finding({
      category: "cross_chapter_contradiction",
      phase: "consistency",
    });
    const evidence = finding({
      category: "citation_gap",
      phase: "completeness",
      severity: "warning",
    });

    expect(
      groupChapterValidationFindings([completeness, consistency, evidence]),
    ).toEqual({
      missing_information: [completeness],
      conflicts_logic: [consistency],
      evidence: [evidence],
    });
  });

  it("builds one document review and deduplicates a symmetric conflict", () => {
    const targetConflict = finding({
      category: "cross_chapter_conflict",
      involved_chapter_ids: ["chapter-target", "chapter-related"],
      message: "The chapters define incompatible investment scope.",
      phase: "consistency",
      suggested_action: "Use one future eligible scope in both chapters.",
    });
    const relatedConflict = {
      ...targetConflict,
      involved_chapter_ids: ["chapter-related", "chapter-target"],
    };
    const evidence = finding({
      category: "evidence_gap",
      phase: "evidence",
      severity: "warning",
    });
    const relatedChapter = {
      ...chapter(),
      chapter_id: "chapter-related",
      title: "Use of EUCF support",
    };

    const review = buildDocumentReviewSummary([
      {
        chapter: chapter(),
        validation: validation({
          checks: [
            {
              key: "template_constraints",
              status: "fail",
            },
          ],
          findings: [targetConflict, evidence],
          status: "incomplete",
        }),
      },
      {
        chapter: relatedChapter,
        validation: validation({
          findings: [relatedConflict],
          status: "incomplete",
        }),
      },
    ]);

    expect(review.status).toBe("incomplete");
    expect(review.blockingCount).toBe(1);
    expect(review.warningCount).toBe(1);
    expect(review.evidenceCount).toBe(1);
    expect(review.templateFailureCount).toBe(1);
    expect(review.groups.conflicts_logic).toHaveLength(1);
  });
});
