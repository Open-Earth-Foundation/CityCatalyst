"use client";
import jsPDF from "jspdf";
import type { MeedReportActionDocument } from "./reportDocument";
import { markdownToBlocks } from "./reportMarkdown";

/**
 * Renders action reports to a PDF.
 *
 * Follows the conventions in `services/PDFExportService.ts` — A4 portrait in
 * millimetres, the same margins, `splitTextToSize` for wrapping and an explicit
 * page break before anything that would overflow. That service's helpers are
 * private and shaped around the HIAP action plan, so this is the same approach
 * rather than the same code.
 */
const MARGIN_X = 18;
const MARGIN_TOP = 20;
const PAGE_BOTTOM = 280;
const CONTENT_WIDTH = 174;

interface PdfCursor {
  doc: jsPDF;
  y: number;
}

/** Move to a new page when the next block would cross the bottom margin. */
function ensureRoom(cursor: PdfCursor, needed: number): void {
  if (cursor.y + needed <= PAGE_BOTTOM) return;
  cursor.doc.addPage();
  cursor.y = MARGIN_TOP;
}

function writeLines(
  cursor: PdfCursor,
  text: string,
  {
    size,
    style,
    indent = 0,
    gap,
  }: {
    size: number;
    style: "normal" | "bold";
    indent?: number;
    gap: number;
  },
): void {
  cursor.doc.setFont("helvetica", style);
  cursor.doc.setFontSize(size);
  const lines: string[] = cursor.doc.splitTextToSize(
    text,
    CONTENT_WIDTH - indent,
  );
  const lineHeight = size * 0.5;
  for (const line of lines) {
    ensureRoom(cursor, lineHeight);
    cursor.doc.text(line, MARGIN_X + indent, cursor.y);
    cursor.y += lineHeight;
  }
  cursor.y += gap;
}

export interface MeedReportPdfMeta {
  title: string;
  cityName: string;
  subtitle: string;
  limitationsLabel: string;
}

export function buildReportPdf(
  documents: MeedReportActionDocument[],
  meta: MeedReportPdfMeta,
): jsPDF {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const cursor: PdfCursor = { doc, y: MARGIN_TOP };

  writeLines(cursor, meta.title, { size: 20, style: "bold", gap: 2 });
  writeLines(cursor, meta.cityName, { size: 13, style: "normal", gap: 1 });
  writeLines(cursor, meta.subtitle, { size: 10, style: "normal", gap: 6 });

  documents.forEach((action, index) => {
    // Each action starts its own page: these are read one action at a time,
    // and a report that begins halfway down a page reads as a continuation.
    if (index > 0) {
      doc.addPage();
      cursor.y = MARGIN_TOP;
    }
    writeLines(cursor, action.actionName, { size: 15, style: "bold", gap: 3 });

    for (const section of action.sections) {
      if (section.title) {
        ensureRoom(cursor, 12);
        writeLines(cursor, section.title, { size: 12, style: "bold", gap: 2 });
      }
      for (const block of markdownToBlocks(section.markdown)) {
        if (block.type === "heading") {
          writeLines(cursor, block.text, { size: 11, style: "bold", gap: 1.5 });
        } else if (block.type === "bullet") {
          writeLines(cursor, `•  ${block.text}`, {
            size: 10,
            style: "normal",
            indent: 4,
            gap: 1,
          });
        } else {
          writeLines(cursor, block.text, {
            size: 10,
            style: "normal",
            gap: 2.5,
          });
        }
      }
      if (section.limitations.length > 0) {
        // Caveats the service attached — carried through, never dropped.
        writeLines(cursor, meta.limitationsLabel, {
          size: 9,
          style: "bold",
          gap: 1,
        });
        for (const limitation of section.limitations) {
          writeLines(cursor, `–  ${limitation}`, {
            size: 9,
            style: "normal",
            indent: 4,
            gap: 0.5,
          });
        }
        cursor.y += 2;
      }
    }
  });

  return doc;
}
