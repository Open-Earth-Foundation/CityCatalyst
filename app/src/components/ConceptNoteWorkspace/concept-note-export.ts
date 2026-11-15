import type { ConceptNoteDraftChapter } from "@/util/types";
import {
  exportInlineRuns,
  exportPdfFont,
  type ExportTextRun,
} from "./export-inline-formatting";

import {
  countMissingInformationMarkers,
  stripMissingInformationMarkers,
} from "./draft-markdown";

export type ConceptNoteExportFormat = "docx" | "pdf";

type ExportBlock =
  | { kind: "blank" }
  | {
      kind: "bullet" | "ordered" | "paragraph";
      text: string;
      runs: ExportTextRun[];
    }
  | { kind: "heading"; level: number; text: string; runs: ExportTextRun[] };

function cleanInlineMarkdown(value: string): string {
  return value
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/(\*\*|__)(.*?)\1/g, "$2")
    .replace(/([*_~`])([^\n]*?)\1/g, "$2")
    .trim();
}

function exportableChapters(
  chapters: ConceptNoteDraftChapter[],
): ConceptNoteDraftChapter[] {
  return chapters
    .filter((chapter) => chapter.body_markdown?.trim())
    .sort((left, right) => left.position - right.position);
}

function stripRepeatedChapterHeading(body: string, title: string): string {
  const lines = markdownLines(body);
  const firstContentIndex = lines.findIndex((line) => line.trim());
  if (firstContentIndex === -1) {
    return "";
  }

  const heading = lines[firstContentIndex].match(/^(#{1,6})\s+(.+)$/);
  const normalizedHeading = cleanInlineMarkdown(heading?.[2] ?? "")
    .replace(/^\d+[.)]\s+/, "")
    .toLowerCase();
  const normalizedTitle = cleanInlineMarkdown(title).toLowerCase();

  if (normalizedHeading !== normalizedTitle) {
    return body.trim();
  }

  lines.splice(firstContentIndex, 1);
  return lines.join("\n").trim();
}

function nestChapterHeadings(body: string): string {
  const lines = markdownLines(body);
  const headingLevels = lines
    .map((line) => line.match(/^(#{1,6})\s+(.+)$/)?.[1].length)
    .filter((level): level is number => level !== undefined);
  const levelShift = 3 - Math.min(3, ...headingLevels);

  if (levelShift === 0) {
    return body;
  }

  return lines
    .map((line) =>
      line.replace(
        /^(#{1,6})(\s+.+)$/,
        (_, hashes: string, text: string) =>
          `${"#".repeat(Math.min(6, hashes.length + levelShift))}${text}`,
      ),
    )
    .join("\n");
}

export function countUnresolvedExportItems(
  chapters: ConceptNoteDraftChapter[],
): number {
  return exportableChapters(chapters).reduce((total, chapter) => {
    const markerCount = countMissingInformationMarkers(
      chapter.body_markdown ?? "",
    );
    const openGapCount = chapter.gaps.filter(
      (gap) => gap.state === "open" || gap.state === "processing",
    ).length;
    return total + Math.max(markerCount, openGapCount);
  }, 0);
}

export function hasCriticalExportBlocker(
  chapters: ConceptNoteDraftChapter[],
): boolean {
  return chapters.some((chapter) =>
    chapter.gaps.some(
      (gap) =>
        gap.severity === "critical" &&
        (gap.state === "open" || gap.state === "processing"),
    ),
  );
}

/**
 * Export warns, never blocks: open critical gaps and other unresolved items
 * require an explicit acknowledgement, but they don't disable the export.
 */
export function canExportConceptNote(
  chapters: ConceptNoteDraftChapter[],
  acceptedMissingInformation: boolean,
): boolean {
  const hasExportableDraft = exportableChapters(chapters).length > 0;
  const unresolvedCount = countUnresolvedExportItems(chapters);
  const needsAcknowledgement =
    unresolvedCount > 0 || hasCriticalExportBlocker(chapters);
  return (
    hasExportableDraft && (!needsAcknowledgement || acceptedMissingInformation)
  );
}

export function buildConceptNoteExportMarkdown(
  noteName: string,
  chapters: ConceptNoteDraftChapter[],
): string {
  const content = exportableChapters(chapters).map((chapter, index) => {
    const body = nestChapterHeadings(
      stripRepeatedChapterHeading(
        stripMissingInformationMarkers(chapter.body_markdown ?? ""),
        chapter.title,
      ),
    );
    const heading = `## ${index + 1}. ${cleanInlineMarkdown(chapter.title)}`;

    return body ? `${heading}\n\n${body}` : heading;
  });

  return [`# ${noteName}`, ...content].join("\n\n").trim();
}

export function conceptNoteExportFilename(noteName: string): string {
  const slug = noteName
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();

  return slug || "concept-note";
}

function markdownLines(markdown: string): string[] {
  return markdown.replace(/\r\n/g, "\n").split("\n");
}

function exportBlocks(markdown: string): ExportBlock[] {
  const spans: Record<string, string>[] = [];
  return markdownLines(markdown).map((line) => {
    const styled = (value: string, heading = false) => {
      const runs = exportInlineRuns(value, spans, heading);
      return { text: runs.map((run) => run.text).join(""), runs };
    };
    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      return {
        kind: "heading",
        level: heading[1].length,
        ...styled(heading[2], true),
      };
    }

    const bullet = line.match(/^\s*[-*+]\s+(.+)$/);
    if (bullet) {
      return { kind: "bullet", ...styled(bullet[1]) };
    }

    const ordered = line.match(/^\s*(\d+[.)])\s+(.+)$/);
    if (ordered) {
      return {
        kind: "ordered",
        ...styled(`${ordered[1]} ${ordered[2]}`),
      };
    }

    const content = styled(line);
    return content.text ? { kind: "paragraph", ...content } : { kind: "blank" };
  });
}

export async function buildConceptNoteDocxBlob(
  markdown: string,
  noteName: string,
  language = "en",
): Promise<Blob> {
  const { Document, HeadingLevel, Packer, Paragraph, TextRun } =
    await import("docx");
  const paragraphs = exportBlocks(markdown).map((block) => {
    const children =
      block.kind === "blank"
        ? []
        : block.runs.map(
            (run) =>
              new TextRun({
                text: run.text,
                bold: run.bold,
                italics: run.italic,
                font: {
                  default: "Open Sans",
                  serif: "Georgia",
                  mono: "Courier New",
                }[run.font],
              }),
          );
    if (block.kind === "heading") {
      const levels = [
        HeadingLevel.TITLE,
        HeadingLevel.HEADING_1,
        HeadingLevel.HEADING_2,
        HeadingLevel.HEADING_3,
        HeadingLevel.HEADING_4,
        HeadingLevel.HEADING_5,
      ];
      return new Paragraph({
        heading: levels[Math.min(block.level - 1, levels.length - 1)],
        children,
      });
    }

    if (block.kind === "bullet") {
      return new Paragraph({
        bullet: { level: 0 },
        children,
      });
    }

    return new Paragraph({
      children,
    });
  });
  const document = new Document({
    creator: "CityCatalyst",
    description: "Concept note exported from CityCatalyst",
    sections: [{ children: paragraphs }],
    styles: {
      default: {
        document: { run: { language: { value: language } } },
      },
    },
    title: noteName,
  });
  return Packer.toBlob(document);
}

function writePdfBlock(
  document: import("@react-pdf/pdfkit").default,
  block: Exclude<ExportBlock, { kind: "blank" }>,
): void {
  if (block.kind === "heading") {
    const fontSize = Math.max(11, 22 - block.level * 2);
    const options = { paragraphGap: block.level === 1 ? 14 : 8 };
    const height = document
      .font("Helvetica-Bold")
      .fontSize(fontSize)
      .heightOfString(block.text, options);
    if (
      document.y + height + 18 >
      document.page.height - document.page.margins.bottom
    ) {
      document.addPage();
    }
    block.runs.forEach((run, index) =>
      document.font(exportPdfFont(run)).text(run.text, {
        ...options,
        continued: index < block.runs.length - 1,
      }),
    );
    return;
  }

  const prefix = block.kind === "bullet" ? "• " : "";
  document.fontSize(10.5);
  const runs = prefix
    ? [
        { text: prefix, font: "default" as const, bold: false, italic: false },
        ...block.runs,
      ]
    : block.runs;
  runs.forEach((run, index) =>
    document.font(exportPdfFont(run)).text(run.text, {
      indent: block.kind === "bullet" || block.kind === "ordered" ? 12 : 0,
      lineGap: 2,
      paragraphGap: 6,
      continued: index < runs.length - 1,
    }),
  );
}

export async function buildConceptNotePdfBlob(
  markdown: string,
  noteName: string,
  language = "en",
): Promise<Blob> {
  const { default: PDFDocument } = await import("@react-pdf/pdfkit");
  const document = new PDFDocument({
    autoFirstPage: true,
    displayTitle: true,
    info: {
      Creator: "CityCatalyst",
      Producer: "CityCatalyst",
      Subject: "Concept note",
      Title: noteName,
    },
    lang: language,
    margins: { bottom: 56.7, left: 56.7, right: 56.7, top: 56.7 },
    pdfVersion: "1.7",
    size: "A4",
    tagged: true,
  });
  const chunks: ArrayBuffer[] = [];
  const blob = new Promise<Blob>((resolve, reject) => {
    document.on("data", (chunk) => {
      const buffer = new ArrayBuffer(chunk.byteLength);
      new Uint8Array(buffer).set(chunk);
      chunks.push(buffer);
    });
    document.on("end", () =>
      resolve(new Blob(chunks, { type: "application/pdf" })),
    );
    document.on("error", reject);
  });
  const structure = document.struct(
    "Document",
    exportBlocks(markdown)
      .filter(
        (block): block is Exclude<ExportBlock, { kind: "blank" }> =>
          block.kind !== "blank",
      )
      .map((block) =>
        document.struct(
          block.kind === "heading" ? `H${Math.min(block.level, 6)}` : "P",
          () => writePdfBlock(document, block),
        ),
      ),
  );
  document.addStructure(structure);
  document.end();
  return blob;
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

export async function exportConceptNote(
  format: ConceptNoteExportFormat,
  noteName: string,
  chapters: ConceptNoteDraftChapter[],
  language = "en",
): Promise<void> {
  const markdown = buildConceptNoteExportMarkdown(noteName, chapters);
  return exportConceptNoteMarkdown(format, noteName, markdown, language);
}

/** Export only the server-authorized snapshot for workspace downloads. */
export async function exportConceptNoteMarkdown(
  format: ConceptNoteExportFormat,
  noteName: string,
  markdown: string,
  language = "en",
): Promise<void> {
  const filename = conceptNoteExportFilename(noteName);

  if (format === "docx") {
    const blob = await buildConceptNoteDocxBlob(markdown, noteName, language);
    downloadBlob(blob, `${filename}.docx`);
    return;
  }

  const blob = await buildConceptNotePdfBlob(markdown, noteName, language);
  downloadBlob(blob, `${filename}.pdf`);
}
