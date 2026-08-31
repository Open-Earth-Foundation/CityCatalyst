import { describe, expect, it } from "@jest/globals";

import {
  conceptNoteResumeHref,
  formatRelativeTime,
  getConceptNoteBundleProgress,
  getConceptNoteReviewStatusPresentation,
  getConceptNoteStatusPresentation,
  getContextSourceStatusTranslationKey,
  getRunProgressPercent,
  getRunStatusPresentation,
  getWorkflowStepTranslationKey,
  hasPrioritizedHiapActions,
  normalizePopulationData,
} from "@/components/ConceptNoteDashboard/utils";
import type {
  ConceptNoteChapterValidation,
  ConceptNoteDraftState,
} from "@/util/types";

function reviewedDraft(
  validation: ConceptNoteChapterValidation | null,
  revisionNumber: number | null = 2,
): ConceptNoteDraftState {
  return {
    chapters: [
      {
        body_markdown: "Draft body",
        chapter_id: "chapter-1",
        missing_information: [],
        position: 0,
        required: true,
        revision_number: revisionNumber,
        status: "ready",
        template_section_id: "summary",
        title: "Project summary",
        user_locked: false,
        validation,
      },
    ],
    completed_chapters: 1,
    current_chapter_id: null,
    error_code: null,
    run_id: "run-1",
    status: "complete",
    total_chapters: 1,
  };
}

function validation(
  overrides: Partial<ConceptNoteChapterValidation> = {},
): ConceptNoteChapterValidation {
  return {
    checks: [],
    findings: [],
    is_stale: false,
    status: "ready",
    validated_at: "2026-08-31T12:00:00Z",
    validated_revision_number: 2,
    ...overrides,
  };
}

describe("Concept Note dashboard presentation helpers", () => {
  it("normalizes valid population data and rejects missing values", () => {
    expect(
      normalizePopulationData({ population: 1_234_567, year: 2025 }),
    ).toEqual({ population: 1_234_567, year: 2025 });
    expect(
      normalizePopulationData({ population: "2746388", year: 2020 }),
    ).toEqual({ population: 2_746_388, year: 2020 });
    expect(normalizePopulationData(undefined)).toBeNull();
    expect(
      normalizePopulationData({ population: undefined, year: undefined }),
    ).toBeNull();
    expect(
      normalizePopulationData({ population: null, year: 2025 }),
    ).toBeNull();
    expect(
      normalizePopulationData({ population: Number.NaN, year: 2025 }),
    ).toBeNull();
  });

  it("maps known and unknown lifecycle values", () => {
    expect(getRunStatusPresentation("active")).toEqual({
      tone: "warning",
      translationKey: "status-in-progress",
    });
    expect(getRunStatusPresentation("future-state")).toEqual({
      tone: "neutral",
      translationKey: "status-unknown",
    });
    expect(getWorkflowStepTranslationKey("interviewing")).toBe(
      "workflow-interviewing",
    );
    expect(getWorkflowStepTranslationKey("future-step")).toBe(
      "workflow-unknown",
    );
    expect(getContextSourceStatusTranslationKey("included")).toBe(
      "bundle-source-included",
    );
    expect(getContextSourceStatusTranslationKey("future-status")).toBe(
      "bundle-source-status-unknown",
    );
  });

  it("uses only complete, current chapter reviews for the visible status", () => {
    expect(
      getConceptNoteReviewStatusPresentation(reviewedDraft(null)),
    ).toBeNull();
    expect(
      getConceptNoteReviewStatusPresentation(
        reviewedDraft(validation({ is_stale: true })),
      ),
    ).toEqual({
      tone: "warning",
      translationKey: "status-review-stale",
    });
    expect(
      getConceptNoteReviewStatusPresentation(
        reviewedDraft(validation({ validated_revision_number: null }), null),
      ),
    ).toEqual({
      tone: "positive",
      translationKey: "status-ready",
    });
    expect(
      getConceptNoteReviewStatusPresentation(reviewedDraft(validation(), 3)),
    ).toEqual({
      tone: "warning",
      translationKey: "status-review-stale",
    });
  });

  it.each([
    {
      expected: { tone: "negative", translationKey: "status-needs-fixes" },
      result: validation({
        findings: [
          {
            category: "missing_information",
            involved_chapter_ids: ["chapter-1"],
            message: "The budget is missing.",
            phase: "completeness",
            severity: "blocking",
            suggested_action: "Add the budget.",
          },
        ],
        status: "incomplete",
      }),
    },
    {
      expected: { tone: "warning", translationKey: "status-reviewed" },
      result: validation({
        findings: [
          {
            category: "evidence_gap",
            involved_chapter_ids: ["chapter-1"],
            message: "The claim needs evidence.",
            phase: "evidence",
            severity: "warning",
            suggested_action: "Add a source.",
          },
        ],
        status: "needs_review",
      }),
    },
    {
      expected: { tone: "positive", translationKey: "status-ready" },
      result: validation(),
    },
  ] as const)(
    "maps a fresh saved review to $expected.translationKey",
    ({ expected, result }) => {
      expect(
        getConceptNoteReviewStatusPresentation(reviewedDraft(result)),
      ).toEqual(expected);
    },
  );

  it("preserves terminal lifecycle states after a review", () => {
    expect(
      getConceptNoteStatusPresentation("exported", reviewedDraft(validation())),
    ).toEqual({
      tone: "positive",
      translationKey: "status-exported",
    });
  });

  it("does not show Ready while export would omit unanswered prompts", () => {
    const draftWithOmission = reviewedDraft(validation());
    draftWithOmission.chapters[0].missing_information = [
      "Confirm the co-financing amount.",
    ];

    expect(getConceptNoteReviewStatusPresentation(draftWithOmission)).toEqual({
      tone: "negative",
      translationKey: "status-needs-fixes",
    });
  });

  it("formats run activity relative to a stable clock", () => {
    const now = Date.parse("2026-08-07T12:00:00Z");

    expect(formatRelativeTime("2026-08-07T10:00:00Z", "en", now)).toBe(
      "2 hours ago",
    );
    expect(formatRelativeTime("not-a-date", "en", now)).toBe("");
  });

  it("uses the durable run ID in resume navigation", () => {
    expect(conceptNoteResumeHref("en", "city-1", "run-1")).toBe(
      "/en/cities/city-1/concept-notes/run-1",
    );
  });

  it("normalizes persisted context-bundle progress defensively", () => {
    expect(
      getConceptNoteBundleProgress({
        unrelated: "preserved",
        context_bundle: {
          status: "ready",
          document_grounding: "uploaded_evidence",
          available_context: {
            city: true,
            project: false,
            ghgi: true,
            ccra: false,
            hiap: false,
            uploaded_documents: true,
          },
          missing_context: [12],
          source_counts: { ready: 2, queued: 1, failed: -1 },
          optional_sources: { ghgi: "included", hiap: "unavailable" },
          retryable: false,
          warnings: ["One optional source was unavailable", 12],
        },
      }),
    ).toEqual({
      status: "ready",
      documentGrounding: "uploaded_evidence",
      availableContext: {
        city: true,
        project: false,
        ghgi: true,
        ccra: false,
        hiap: false,
        uploadedDocuments: true,
      },
      missingContext: [],
      readySources: 2,
      queuedSources: 1,
      processingSources: 0,
      failedSources: 0,
      ghgiStatus: "included",
      hiapStatus: "unavailable",
      retryable: false,
    });
    expect(
      getConceptNoteBundleProgress({
        context_bundle: {
          document_grounding: "future-mode",
          missing_context: "source_documents",
        },
      }),
    ).toMatchObject({
      status: null,
      documentGrounding: null,
      availableContext: {
        city: false,
        project: false,
        ghgi: false,
        ccra: false,
        hiap: false,
        uploadedDocuments: false,
      },
      missingContext: [],
      readySources: 0,
    });

    expect(
      getConceptNoteBundleProgress({
        context_bundle: {
          context_mode: "grounded",
        },
      }),
    ).toMatchObject({
      documentGrounding: "uploaded_evidence",
      availableContext: {
        uploadedDocuments: true,
      },
    });
  });

  it("reports HIAP context only when prioritized actions exist", () => {
    expect(hasPrioritizedHiapActions(null)).toBe(false);
    expect(
      hasPrioritizedHiapActions({ error: "module-access-denied-hiap" }),
    ).toBe(false);
    expect(
      hasPrioritizedHiapActions({
        mitigation: { rankedActions: [] },
        adaptation: { rankedActions: [] },
      }),
    ).toBe(false);
    expect(
      hasPrioritizedHiapActions({
        mitigation: { rankedActions: [{ id: "action-1" }] },
        adaptation: { rankedActions: [] },
      }),
    ).toBe(true);
  });

  it("derives conservative run progress without inventing document work", () => {
    expect(getRunProgressPercent("active", "assembling_context", {})).toBe(4);
    expect(
      getRunProgressPercent("active", "assembling_context", {
        context_bundle: { status: "building" },
      }),
    ).toBe(28);
    expect(
      getRunProgressPercent("active", "interviewing", {
        context_bundle: { status: "ready" },
      }),
    ).toBe(40);
    expect(getRunProgressPercent("exported", "exported", {})).toBe(100);
  });
});
