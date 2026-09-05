import {
  buildConceptNoteExportMarkdown,
  canExportConceptNote,
  conceptNoteExportFilename,
  countUnresolvedExportItems,
  hasCriticalExportBlocker,
} from "@/components/ConceptNoteWorkspace/concept-note-export";
import type { ConceptNoteDraftChapter } from "@/util/types";

function chapter(
  overrides: Partial<ConceptNoteDraftChapter>,
): ConceptNoteDraftChapter {
  return {
    chapter_id: "chapter-1",
    template_section_id: "section-1",
    title: "Project summary",
    position: 1,
    status: "needs_review",
    required: true,
    user_locked: false,
    body_markdown: "# Project summary\n\nKnown text.",
    gaps: [],
    open_gap_count: 0,
    caveat_count: 0,
    revision_number: 1,
    confirmed_body_markdown: null,
    confirmed_revision_number: null,
    proposed_revision_number: null,
    regeneration_status: "idle",
    regeneration_error: null,
    ...overrides,
  };
}

describe("concept note export preparation", () => {
  test("removes review-only missing-information markers and keeps chapter order", () => {
    const markdown = buildConceptNoteExportMarkdown("Kraków Tram", [
      chapter({
        chapter_id: "chapter-2",
        position: 2,
        title: "Objectives",
        body_markdown: "# Objectives\n\nSecond chapter.",
      }),
      chapter({
        body_markdown:
          "# Project summary\n\nKnown text. [Information needed: Confirm the sponsor.]",
      }),
    ]);

    expect(markdown).toContain("# Kraków Tram");
    expect(markdown.indexOf("# Project summary")).toBeLessThan(
      markdown.indexOf("# Objectives"),
    );
    expect(markdown).not.toContain("Information needed");
    expect(markdown).toContain("Known text.");
  });

  test("uses structured gaps when they exceed visible markers", () => {
    const chapters = [
      chapter({
        body_markdown: "Known text. [Information needed: Confirm the sponsor.]",
        open_gap_count: 2,
        gaps: ["sponsor", "budget"].map((fieldKey, index) => ({
          gap_id: `gap-${index}`,
          field_key: fieldKey,
          question: `Confirm the ${fieldKey}`,
          why_asking: "Required for the application",
          severity: "noncritical" as const,
          state: "open" as const,
          suggestions: [],
          source_refs: [],
          version: 1,
          resolution: null,
          created_at: "2026-08-23T12:00:00Z",
          updated_at: "2026-08-23T12:00:00Z",
        })),
      }),
    ];

    expect(countUnresolvedExportItems(chapters)).toBe(2);
    expect(canExportConceptNote(chapters, false)).toBe(false);
    expect(canExportConceptNote(chapters, true)).toBe(true);
  });

  test("allows a gap-free draft without acknowledgement", () => {
    expect(canExportConceptNote([chapter({ status: "draft" })], false)).toBe(
      true,
    );
    expect(canExportConceptNote([], true)).toBe(false);
  });

  test("blocks open critical gaps but allows acknowledged caveats", () => {
    const criticalGap = {
      gap_id: "gap-critical",
      field_key: "legal_authority",
      question: "Who has legal authority to submit?",
      why_asking: "The applicant must be eligible.",
      severity: "critical" as const,
      state: "open" as const,
      suggestions: [],
      source_refs: [],
      version: 1,
      resolution: null,
      created_at: "2026-08-23T12:00:00Z",
      updated_at: "2026-08-23T12:00:00Z",
    };
    const blocked = [chapter({ gaps: [criticalGap], open_gap_count: 1 })];

    expect(hasCriticalExportBlocker(blocked)).toBe(true);
    expect(canExportConceptNote(blocked, true)).toBe(false);

    const caveat = [
      chapter({
        status: "ready",
        gaps: [
          {
            ...criticalGap,
            severity: "noncritical",
            state: "caveat",
          },
        ],
        open_gap_count: 0,
        caveat_count: 1,
      }),
    ];
    expect(hasCriticalExportBlocker(caveat)).toBe(false);
    expect(canExportConceptNote(caveat, false)).toBe(true);
  });

  test("creates a safe download filename", () => {
    expect(conceptNoteExportFilename("Kraków Tram — Stage IV")).toBe(
      "krakow-tram-stage-iv",
    );
  });
});
