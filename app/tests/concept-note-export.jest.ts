import {
  buildConceptNoteExportMarkdown,
  canExportConceptNote,
  conceptNoteExportFilename,
  countUnresolvedExportItems,
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
    missing_information: [],
    revision_number: 1,
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
        missing_information: ["Confirm the sponsor", "Confirm the budget"],
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

  test("creates a safe download filename", () => {
    expect(conceptNoteExportFilename("Kraków Tram — Stage IV")).toBe(
      "krakow-tram-stage-iv",
    );
  });
});
