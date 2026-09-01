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

  it.each([
    [null, 2, null],
    [validation({ is_stale: true }), 2, "status-review-stale"],
    [validation(), 3, "status-review-stale"],
    [validation({ status: "incomplete" }), 2, "status-needs-fixes"],
    [validation(), 2, "status-ready"],
  ] as const)("maps review state to %s", (result, revision, translationKey) => {
    const presentation = getConceptNoteReviewStatusPresentation(
      reviewedDraft(result, revision),
    );
    expect(presentation?.translationKey ?? null).toBe(translationKey);
  });

  it("preserves terminal lifecycle states after a review", () => {
    expect(
      getConceptNoteStatusPresentation("exported", reviewedDraft(validation())),
    ).toEqual({
      tone: "positive",
      translationKey: "status-exported",
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
