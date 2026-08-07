import { describe, expect, it } from "@jest/globals";

import {
  conceptNoteResumeHref,
  formatRelativeTime,
  getRunStatusPresentation,
  humanizeLifecycleValue,
} from "@/components/ConceptNoteDashboard/utils";

describe("Concept Note dashboard presentation helpers", () => {
  it.each([
    ["completed", "positive"],
    ["active", "warning"],
    ["draft", "info"],
    ["failed", "negative"],
    ["future-state", "neutral"],
  ] as const)("maps %s to the %s tone", (status, tone) => {
    expect(getRunStatusPresentation(status).tone).toBe(tone);
  });

  it("humanizes persisted lifecycle values", () => {
    expect(humanizeLifecycleValue("assembling_context")).toBe(
      "Assembling context",
    );
    expect(humanizeLifecycleValue("ready-for-review")).toBe("Ready for review");
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
      "/en/cities/city-1/concept-notes/wiring?runId=run-1",
    );
  });
});
