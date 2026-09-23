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
let hasCriticalExportBlocker: typeof import("@/components/ConceptNoteWorkspace/concept-note-export").hasCriticalExportBlocker;
let countUnresolvedExportItems: typeof import("@/components/ConceptNoteWorkspace/concept-note-export").countUnresolvedExportItems;

beforeAll(async () => {
  ({
    buildConceptNoteDocxBlob,
    buildConceptNoteExportMarkdown,
    buildConceptNotePdfBlob,
    canExportConceptNote,
    conceptNoteExportFilename,
    countUnresolvedExportItems,
    hasCriticalExportBlocker,
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
    gaps: [],
    open_gap_count: 0,
    caveat_count: 0,
    revision_number: 1,
    confirmed_body_markdown: null,
    confirmed_revision_number: null,
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
