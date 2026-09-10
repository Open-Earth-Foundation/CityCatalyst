import { beforeAll, describe, expect, jest, test } from "@jest/globals";

const mockPdfOptions: Array<Record<string, unknown>> = [];
const mockPdfStructureTypes: string[] = [];

jest.unstable_mockModule("@react-pdf/pdfkit", () => ({
  __esModule: true,
  default: class MockPdfDocument {
    private handlers: Record<string, (value?: Uint8Array) => void> = {};
    page = { height: 842, margins: { bottom: 57 } };
    y = 57;

    constructor(options: Record<string, unknown>) {
      mockPdfOptions.push(options);
    }

    addPage() {
      return this;
    }

    addStructure() {}

    end() {
      this.handlers.data?.(new TextEncoder().encode("%PDF-1.7"));
      this.handlers.end?.();
    }

    font() {
      return this;
    }

    fontSize() {
      return this;
    }

    heightOfString() {
      return 12;
    }

    on(event: string, handler: (value?: Uint8Array) => void) {
      this.handlers[event] = handler;
      return this;
    }

    struct(type: string, content: unknown) {
      mockPdfStructureTypes.push(type);
      if (typeof content === "function") {
        content();
      }
      return { type };
    }

    text() {
      return this;
    }
  },
}));

import type { ConceptNoteDraftChapter } from "@/util/types";

let buildConceptNoteDocxBlob: typeof import("@/components/ConceptNoteWorkspace/concept-note-export").buildConceptNoteDocxBlob;
let buildConceptNoteExportMarkdown: typeof import("@/components/ConceptNoteWorkspace/concept-note-export").buildConceptNoteExportMarkdown;
let buildConceptNotePdfBlob: typeof import("@/components/ConceptNoteWorkspace/concept-note-export").buildConceptNotePdfBlob;
let canExportConceptNote: typeof import("@/components/ConceptNoteWorkspace/concept-note-export").canExportConceptNote;
let conceptNoteExportFilename: typeof import("@/components/ConceptNoteWorkspace/concept-note-export").conceptNoteExportFilename;
let countUnresolvedExportItems: typeof import("@/components/ConceptNoteWorkspace/concept-note-export").countUnresolvedExportItems;

beforeAll(async () => {
  ({
    buildConceptNoteDocxBlob,
    buildConceptNoteExportMarkdown,
    buildConceptNotePdfBlob,
    canExportConceptNote,
    conceptNoteExportFilename,
    countUnresolvedExportItems,
  } = await import("@/components/ConceptNoteWorkspace/concept-note-export"));
});

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
  test("adds numbered chapter headings, removes duplicates, and keeps chapter order", () => {
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
    expect(markdown.indexOf("## 1. Project summary")).toBeLessThan(
      markdown.indexOf("## 2. Objectives"),
    );
    expect(markdown.match(/Project summary/g)).toHaveLength(1);
    expect(markdown.match(/Objectives/g)).toHaveLength(1);
    expect(markdown).not.toContain("Information needed");
    expect(markdown).toContain("Known text.");
  });

  test("adds a chapter heading when the generated body does not contain one", () => {
    const markdown = buildConceptNoteExportMarkdown("Kraków Tram", [
      chapter({
        body_markdown:
          "Known text without a heading.\n\n## Expected outcomes\n\nMore text.",
      }),
    ]);

    expect(markdown).toBe(
      "# Kraków Tram\n\n## 1. Project summary\n\nKnown text without a heading.\n\n### Expected outcomes\n\nMore text.",
    );
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

  test("creates a structured DOCX blob", async () => {
    const markdown = buildConceptNoteExportMarkdown("Kraków Tram", [
      chapter({ body_markdown: "Known text without a heading." }),
    ]);

    const blob = await buildConceptNoteDocxBlob(markdown, "Kraków Tram", "pl");

    expect(blob.type).toBe(
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    );
    expect(blob.size).toBeGreaterThan(0);
  });

  test("creates a tagged PDF with title, language, and heading structure", async () => {
    const markdown = buildConceptNoteExportMarkdown("Krakow Tram", [
      chapter({ body_markdown: "Known text without a heading." }),
    ]);

    const blob = await buildConceptNotePdfBlob(
      markdown,
      "Krakow Tram",
      "en-GB",
    );

    expect(blob.type).toBe("application/pdf");
    expect(blob.size).toBeGreaterThan(0);
    expect(mockPdfOptions.at(-1)).toMatchObject({
      info: { Title: "Krakow Tram" },
      lang: "en-GB",
      tagged: true,
    });
    expect(mockPdfStructureTypes).toEqual(
      expect.arrayContaining(["Document", "H1", "H2"]),
    );
  });
});
