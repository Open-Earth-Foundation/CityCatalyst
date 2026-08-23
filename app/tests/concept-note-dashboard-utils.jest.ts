import { describe, expect, it } from "@jest/globals";

import {
  conceptNoteResumeHref,
  formatRelativeTime,
  getConceptNoteBundleProgress,
  getContextSourceStatusTranslationKey,
  getRunProgressPercent,
  getRunStatusPresentation,
  getWorkflowStepTranslationKey,
} from "@/components/ConceptNoteDashboard/utils";

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
          context_mode: "thin",
          missing_context: ["source_documents", 12],
          source_counts: { ready: 2, queued: 1, failed: -1 },
          optional_sources: { ghgi: "included", hiap: "unavailable" },
          retryable: false,
          warnings: ["One optional source was unavailable", 12],
        },
      }),
    ).toEqual({
      status: "ready",
      contextMode: "thin",
      missingContext: ["source_documents"],
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
          context_mode: "future-mode",
          missing_context: "source_documents",
        },
      }),
    ).toMatchObject({
      status: null,
      contextMode: null,
      missingContext: [],
      readySources: 0,
    });
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
