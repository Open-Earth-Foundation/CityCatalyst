import type { ConceptNoteDraftChapter } from "@/util/types";

import {
  countMissingInformationMarkers,
  stripMissingInformationMarkers,
} from "./draft-markdown";

export type ConceptNoteExportFormat = "docx" | "pdf";

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

export function countUnresolvedExportItems(
  chapters: ConceptNoteDraftChapter[],
): number {
  return exportableChapters(chapters).reduce((total, chapter) => {
    const markerCount = countMissingInformationMarkers(
      chapter.body_markdown ?? "",
    );
    return total + Math.max(markerCount, chapter.missing_information.length);
  }, 0);
}

export function canExportConceptNote(
  chapters: ConceptNoteDraftChapter[],
  acceptedMissingInformation: boolean,
): boolean {
  const hasExportableDraft = exportableChapters(chapters).length > 0;
  const unresolvedCount = countUnresolvedExportItems(chapters);
  return (
    hasExportableDraft && (unresolvedCount === 0 || acceptedMissingInformation)
  );
}

export function buildConceptNoteExportMarkdown(
  noteName: string,
  chapters: ConceptNoteDraftChapter[],
): string {
  const content = exportableChapters(chapters)
    .map((chapter) =>
      stripMissingInformationMarkers(chapter.body_markdown ?? ""),
    )
    .filter(Boolean);

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

async function exportDocx(markdown: string, filename: string): Promise<void> {
  const { Document, HeadingLevel, Packer, Paragraph } = await import("docx");
  const paragraphs = markdownLines(markdown).map((line) => {
    const heading = line.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      const levels = [
        HeadingLevel.TITLE,
        HeadingLevel.HEADING_1,
        HeadingLevel.HEADING_2,
        HeadingLevel.HEADING_3,
        HeadingLevel.HEADING_4,
        HeadingLevel.HEADING_5,
      ];
      return new Paragraph({
        heading: levels[Math.min(heading[1].length - 1, levels.length - 1)],
        text: cleanInlineMarkdown(heading[2]),
      });
    }

    const bullet = line.match(/^\s*[-*+]\s+(.+)$/);
    if (bullet) {
      return new Paragraph({
        bullet: { level: 0 },
        text: cleanInlineMarkdown(bullet[1]),
      });
    }

    return new Paragraph({ text: cleanInlineMarkdown(line) });
  });
  const document = new Document({ sections: [{ children: paragraphs }] });
  const blob = await Packer.toBlob(document);
  downloadBlob(blob, `${filename}.docx`);
}

async function exportPdf(markdown: string, filename: string): Promise<void> {
  const { default: jsPDF } = await import("jspdf");
  const document = new jsPDF();
  const pageHeight = document.internal.pageSize.getHeight();
  const contentWidth = document.internal.pageSize.getWidth() - 40;
  let cursorY = 20;

  for (const sourceLine of markdownLines(markdown)) {
    const heading = sourceLine.match(/^(#{1,6})\s+(.+)$/);
    const bullet = sourceLine.match(/^\s*[-*+]\s+(.+)$/);
    const ordered = sourceLine.match(/^\s*(\d+[.)])\s+(.+)$/);
    const text = cleanInlineMarkdown(
      heading?.[2] ?? bullet?.[1] ?? ordered?.[2] ?? sourceLine,
    );
    const fontSize = heading ? Math.max(12, 21 - heading[1].length * 2) : 10.5;
    const prefix = bullet ? "• " : ordered ? `${ordered[1]} ` : "";
    const lines = document.splitTextToSize(`${prefix}${text}`, contentWidth);
    const lineHeight = fontSize * 0.45;
    const blockHeight = Math.max(lineHeight, lines.length * lineHeight);

    if (cursorY + blockHeight > pageHeight - 20) {
      document.addPage();
      cursorY = 20;
    }

    document.setFont("helvetica", heading ? "bold" : "normal");
    document.setFontSize(fontSize);
    if (text || prefix) {
      document.text(lines, 20, cursorY);
    }
    cursorY += blockHeight + (heading ? 3 : 1.5);
  }

  document.save(`${filename}.pdf`);
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
): Promise<void> {
  const markdown = buildConceptNoteExportMarkdown(noteName, chapters);
  const filename = conceptNoteExportFilename(noteName);

  if (format === "docx") {
    await exportDocx(markdown, filename);
    return;
  }

  await exportPdf(markdown, filename);
}
