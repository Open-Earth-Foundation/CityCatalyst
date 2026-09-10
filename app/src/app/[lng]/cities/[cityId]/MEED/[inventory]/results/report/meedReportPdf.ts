"use client";
// Named import, not the default: jspdf's ESM build has no default export, so
// `import jsPDF from "jspdf"` resolves only under a bundler's interop. The named
// export works everywhere, which is what makes this renderer testable at all.
import { jsPDF } from "jspdf";
import type { MeedReportActionDocument } from "./reportDocument";
import {
  markdownToBlocks,
  spansToText,
  type MeedReportBlock,
  type MeedReportSpan,
  type MeedTableAlign,
} from "./reportMarkdown";

/**
 * Renders action reports to a branded PDF.
 *
 * Follows `services/PDFExportService.ts`: A4 portrait in millimetres, the same
 * palette lifted from `lib/theme/recipes/app-theme.ts`, the same wide logo, and
 * the same footer rule. That service's helpers are private and shaped around
 * the HIAP action plan, so this is the same conventions rather than the same
 * code.
 *
 * Beyond it, this one lays out **runs** and **tables**, because the chapters
 * contain both and neither survives a plain `text()` call.
 */

// CityCatalyst brand palette (see src/lib/theme/recipes/app-theme.ts)
type RGB = [number, number, number];
const BRAND: RGB = [35, 81, 220]; // #2351DC
const BRAND_DARK: RGB = [0, 30, 167]; // #001EA7
const INK: RGB = [0, 0, 31]; // #00001F
const INK_TERTIARY: RGB = [75, 76, 99]; // #4B4C63
const BG_NEUTRAL: RGB = [232, 234, 251]; // #E8EAFB
const BORDER: RGB = [215, 216, 250]; // #D7D8FA
const MUTED: RGB = [136, 135, 128]; // #888780
const WHITE: RGB = [255, 255, 255];

const MARGIN_X = 20;
const MARGIN_TOP = 22;
const CONTENT_WIDTH = 170;
const PAGE_BOTTOM = 272; // above the footer rule at 283
const LOGO_SRC = "/assets/citycatalyst-logo-blue.png";
const LOGO_ASPECT = 216 / 996; // height / width of citycatalyst-logo-blue.png

/** Line height for a given point size, in mm. */
const leading = (size: number) => size * 0.45;

interface PdfCursor {
  doc: jsPDF;
  y: number;
}

function ensureRoom(cursor: PdfCursor, needed: number): void {
  if (cursor.y + needed <= PAGE_BOTTOM) return;
  cursor.doc.addPage();
  cursor.y = MARGIN_TOP;
}

function applySpanFont(doc: jsPDF, span: MeedReportSpan, size: number): void {
  const style = span.bold
    ? span.italic
      ? "bolditalic"
      : "bold"
    : span.italic
      ? "italic"
      : "normal";
  doc.setFont(span.code ? "courier" : "helvetica", style);
  doc.setFontSize(size);
}

interface LaidOutWord {
  span: MeedReportSpan;
  text: string;
  width: number;
  /** A space that may be dropped when it lands at a line break. */
  breakable: boolean;
}

/**
 * Splits runs into measured words.
 *
 * Wrapping has to happen across runs, not within them: "**The ask:** Support
 * municipal delivery…" is one sentence in two runs, and wrapping each run
 * separately would break the line at the bold boundary every time.
 */
function measureWords(
  doc: jsPDF,
  spans: MeedReportSpan[],
  size: number,
): LaidOutWord[] {
  const words: LaidOutWord[] = [];
  for (const span of spans) {
    applySpanFont(doc, span, size);
    const parts = span.text.split(/(\s+)/).filter((part) => part.length > 0);
    for (const part of parts) {
      const breakable = /^\s+$/.test(part);
      words.push({
        span,
        text: breakable ? " " : part,
        width: doc.getTextWidth(breakable ? " " : part),
        breakable,
      });
    }
  }
  return words;
}

function wrapWords(words: LaidOutWord[], width: number): LaidOutWord[][] {
  const lines: LaidOutWord[][] = [];
  let line: LaidOutWord[] = [];
  let used = 0;

  for (const word of words) {
    if (word.breakable && line.length === 0) continue; // no leading spaces
    if (used + word.width > width && line.length > 0) {
      // Trailing spaces do not belong to the line they broke.
      while (line.length > 0 && line[line.length - 1].breakable) line.pop();
      lines.push(line);
      line = [];
      used = 0;
      if (word.breakable) continue;
    }
    line.push(word);
    used += word.width;
  }
  while (line.length > 0 && line[line.length - 1].breakable) line.pop();
  if (line.length > 0) lines.push(line);
  return lines.length > 0 ? lines : [[]];
}

const lineWidth = (line: LaidOutWord[]) =>
  line.reduce((sum, word) => sum + word.width, 0);

/** Draws one wrapped line, run by run, registering link areas as it goes. */
function drawLine(
  doc: jsPDF,
  line: LaidOutWord[],
  x: number,
  y: number,
  size: number,
  color: RGB,
): void {
  let cursorX = x;
  for (const word of line) {
    applySpanFont(doc, word.span, size);
    doc.setTextColor(...(word.span.href ? BRAND : color));
    doc.text(word.text, cursorX, y);
    if (word.span.href && !word.breakable) {
      // Underline plus a real annotation: the text alone is useless in a PDF
      // ("Programme page" naming no programme), and these cells are the only
      // route from the report back to the funder.
      doc.setDrawColor(...BRAND);
      doc.setLineWidth(0.2);
      doc.line(cursorX, y + 0.8, cursorX + word.width, y + 0.8);
      doc.link(cursorX, y - size * 0.32, word.width, size * 0.42, {
        url: word.span.href,
      });
    }
    cursorX += word.width;
  }
}

interface TextOptions {
  size: number;
  color?: RGB;
  indent?: number;
  width?: number;
  gapBefore?: number;
  gapAfter?: number;
  align?: MeedTableAlign;
}

function writeSpans(
  cursor: PdfCursor,
  spans: MeedReportSpan[],
  {
    size,
    color = INK,
    indent = 0,
    width = CONTENT_WIDTH - indent,
    gapBefore = 0,
    gapAfter = 0,
    align = "left",
  }: TextOptions,
): void {
  const height = leading(size);
  const lines = wrapWords(measureWords(cursor.doc, spans, size), width);
  cursor.y += gapBefore;
  for (const line of lines) {
    ensureRoom(cursor, height);
    const offset =
      align === "right"
        ? width - lineWidth(line)
        : align === "center"
          ? (width - lineWidth(line)) / 2
          : 0;
    drawLine(
      cursor.doc,
      line,
      MARGIN_X + indent + offset,
      cursor.y,
      size,
      color,
    );
    cursor.y += height;
  }
  cursor.y += gapAfter;
}

const CELL_SIZE = 8.5;
const CELL_PAD_X = 2.5;
const CELL_PAD_Y = 2.2;

/**
 * Column widths, proportional to what each column actually holds.
 *
 * Even columns would waste half the page on "Page" and squeeze "What the
 * document says" into a ribbon. Natural width is capped before normalising so
 * one very long cell cannot claim the whole table, and every column keeps a
 * floor wide enough for a short word.
 */
function columnWidths(
  doc: jsPDF,
  header: MeedReportSpan[][],
  rows: MeedReportSpan[][][],
): number[] {
  const count = header.length;
  const natural = header.map((cell, index) => {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(CELL_SIZE);
    let widest = doc.getTextWidth(spansToText(cell));
    doc.setFont("helvetica", "normal");
    for (const row of rows) {
      widest = Math.max(
        widest,
        doc.getTextWidth(spansToText(row[index] ?? [])),
      );
    }
    return Math.min(widest, CONTENT_WIDTH * 0.45) + CELL_PAD_X * 2;
  });

  const floor = 14;
  const total = natural.reduce((sum, width) => sum + width, 0);
  const scale = (CONTENT_WIDTH - floor * count) / Math.max(total, 1);
  const widths = natural.map((width) => floor + width * scale);

  // Absorb rounding into the last column so the table meets the right margin.
  const drift = CONTENT_WIDTH - widths.reduce((sum, w) => sum + w, 0);
  widths[count - 1] += drift;
  return widths;
}

function cellLines(
  doc: jsPDF,
  cells: MeedReportSpan[][],
  widths: number[],
  bold: boolean,
): LaidOutWord[][][] {
  return cells.map((cell, index) => {
    const spans = bold ? cell.map((span) => ({ ...span, bold: true })) : cell;
    return wrapWords(
      measureWords(doc, spans, CELL_SIZE),
      widths[index] - CELL_PAD_X * 2,
    );
  });
}

const rowHeight = (lines: LaidOutWord[][][]) =>
  Math.max(...lines.map((cell) => cell.length), 1) * leading(CELL_SIZE) +
  CELL_PAD_Y * 2;

function drawRow(
  cursor: PdfCursor,
  lines: LaidOutWord[][][],
  widths: number[],
  align: MeedTableAlign[],
  { fill, color }: { fill?: RGB; color: RGB },
): void {
  const { doc } = cursor;
  const height = rowHeight(lines);

  if (fill) {
    doc.setFillColor(...fill);
    doc.rect(MARGIN_X, cursor.y, CONTENT_WIDTH, height, "F");
  }

  let x = MARGIN_X;
  lines.forEach((cell, index) => {
    const inner = widths[index] - CELL_PAD_X * 2;
    let y = cursor.y + CELL_PAD_Y + leading(CELL_SIZE) * 0.75;
    for (const line of cell) {
      const offset =
        align[index] === "right"
          ? inner - lineWidth(line)
          : align[index] === "center"
            ? (inner - lineWidth(line)) / 2
            : 0;
      drawLine(doc, line, x + CELL_PAD_X + offset, y, CELL_SIZE, color);
      y += leading(CELL_SIZE);
    }
    x += widths[index];
  });

  doc.setDrawColor(...BORDER);
  doc.setLineWidth(0.2);
  doc.line(
    MARGIN_X,
    cursor.y + height,
    MARGIN_X + CONTENT_WIDTH,
    cursor.y + height,
  );
  cursor.y += height;
}

function drawTable(
  cursor: PdfCursor,
  table: Extract<MeedReportBlock, { type: "table" }>,
): void {
  const { doc } = cursor;
  const widths = columnWidths(doc, table.header, table.rows);
  const header = cellLines(doc, table.header, widths, true);
  const headerHeight = rowHeight(header);

  const drawHeader = () => {
    drawRow(cursor, header, widths, table.align, {
      fill: BG_NEUTRAL,
      color: BRAND_DARK,
    });
  };

  cursor.y += 2;
  // Never leave a header stranded at the foot of a page.
  ensureRoom(cursor, headerHeight + leading(CELL_SIZE) * 2);
  drawHeader();

  table.rows.forEach((row, index) => {
    const lines = cellLines(doc, row, widths, false);
    const height = rowHeight(lines);
    if (cursor.y + height > PAGE_BOTTOM) {
      doc.addPage();
      cursor.y = MARGIN_TOP;
      // A continued table needs its header again, or the columns lose meaning.
      drawHeader();
    }
    drawRow(cursor, lines, widths, table.align, {
      fill: index % 2 === 1 ? WHITE : undefined,
      color: INK,
    });
  });

  cursor.y += 4;
}

export interface MeedReportPdfMeta {
  title: string;
  cityName: string;
  subtitle: string;
  limitationsLabel: string;
  generatedBy: string;
  generatedOn: string;
  pageLabel: string;
  ofLabel: string;
}

/** The wide brand lockup as a data URL. Null when it cannot be fetched. */
async function loadLogo(): Promise<string | null> {
  try {
    const res = await fetch(LOGO_SRC);
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

function drawCover(
  cursor: PdfCursor,
  meta: MeedReportPdfMeta,
  logo: string | null,
): void {
  const { doc } = cursor;
  cursor.y = 16;

  if (logo) {
    const width = 42;
    try {
      doc.addImage(logo, "PNG", MARGIN_X, cursor.y, width, width * LOGO_ASPECT);
      cursor.y += width * LOGO_ASPECT + 12;
    } catch {
      cursor.y += 8; // continue without the logo rather than failing the export
    }
  } else {
    cursor.y += 8;
  }

  writeSpans(cursor, [{ text: meta.title, bold: true }], {
    size: 22,
    gapAfter: 2,
  });
  writeSpans(cursor, [{ text: meta.cityName }], {
    size: 14,
    color: INK_TERTIARY,
    gapAfter: 1,
  });
  writeSpans(cursor, [{ text: meta.subtitle }], {
    size: 10,
    color: MUTED,
    gapAfter: 4,
  });

  doc.setDrawColor(...BRAND);
  doc.setLineWidth(1);
  doc.line(MARGIN_X, cursor.y, MARGIN_X + CONTENT_WIDTH, cursor.y);
  cursor.y += 10;
}

/** Section heading: a brand bar plus the title, the module's card idiom. */
function drawSectionTitle(cursor: PdfCursor, title: string): void {
  const { doc } = cursor;
  ensureRoom(cursor, 16);
  cursor.y += 4;
  const height = leading(12) + 2;
  doc.setFillColor(...BRAND);
  doc.rect(MARGIN_X, cursor.y - height + 2, 1.4, height, "F");
  writeSpans(cursor, [{ text: title, bold: true }], {
    size: 12,
    color: BRAND_DARK,
    indent: 5,
    gapAfter: 2.5,
  });
}

/** Caveats the service attached — carried through on a tinted band, never dropped. */
function drawLimitations(
  cursor: PdfCursor,
  label: string,
  limitations: string[],
): void {
  const { doc } = cursor;
  const size = 8.5;
  ensureRoom(cursor, 18);
  cursor.y += 2;

  const top = cursor.y;
  const start = doc.getNumberOfPages();
  cursor.y += 3;
  writeSpans(cursor, [{ text: label, bold: true }], {
    size,
    color: BRAND_DARK,
    indent: 4,
    width: CONTENT_WIDTH - 8,
    gapAfter: 0.5,
  });
  for (const limitation of limitations) {
    writeSpans(cursor, [{ text: `–  ${limitation}` }], {
      size,
      color: INK_TERTIARY,
      indent: 4,
      width: CONTENT_WIDTH - 8,
    });
  }
  cursor.y += 3;

  // Only draw the band when the block did not straddle a page: a rectangle
  // cannot span pages, and a half-drawn one reads as a rendering fault.
  if (doc.getNumberOfPages() === start) {
    doc.setFillColor(...BG_NEUTRAL);
    doc.setDrawColor(...BORDER);
    doc.roundedRect(
      MARGIN_X,
      top,
      CONTENT_WIDTH,
      cursor.y - top,
      1.5,
      1.5,
      "S",
    );
  }
  cursor.y += 3;
}

function drawFooters(doc: jsPDF, meta: MeedReportPdfMeta): void {
  const pages = doc.getNumberOfPages();
  for (let page = 1; page <= pages; page++) {
    doc.setPage(page);
    doc.setDrawColor(...BORDER);
    doc.setLineWidth(0.3);
    doc.line(MARGIN_X, 283, MARGIN_X + CONTENT_WIDTH, 283);

    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...MUTED);
    doc.text(
      `${meta.generatedBy} · ${meta.pageLabel} ${page} ${meta.ofLabel} ${pages}`,
      MARGIN_X,
      288,
    );
    doc.text(meta.generatedOn, MARGIN_X + CONTENT_WIDTH, 288, {
      align: "right",
    });
  }
}

function drawBlock(cursor: PdfCursor, block: MeedReportBlock): void {
  if (block.type === "table") {
    drawTable(cursor, block);
    return;
  }
  if (block.type === "heading") {
    writeSpans(cursor, block.spans, {
      size: block.level <= 2 ? 11.5 : 10.5,
      color: INK,
      gapBefore: 2,
      gapAfter: 1.5,
    });
    return;
  }
  if (block.type === "bullet") {
    const { doc } = cursor;
    // The marker sits on the first line's baseline, so measure before writing.
    const y = cursor.y;
    writeSpans(cursor, block.spans, {
      size: 9.5,
      color: INK_TERTIARY,
      indent: 6,
      gapAfter: 1,
    });
    doc.setFillColor(...BRAND);
    if (block.marker === "•") {
      doc.circle(MARGIN_X + 2, y - 1.1, 0.8, "F");
    } else {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9.5);
      doc.setTextColor(...BRAND);
      doc.text(block.marker, MARGIN_X + 0.5, y);
    }
    return;
  }
  writeSpans(cursor, block.spans, { size: 9.5, color: INK, gapAfter: 2.5 });
}

export async function buildReportPdf(
  documents: MeedReportActionDocument[],
  meta: MeedReportPdfMeta,
): Promise<jsPDF> {
  // Compressed: jsPDF embeds the logo bitmap raw otherwise, which costs about
  // 850 KB on every report regardless of length.
  const doc = new jsPDF({ unit: "mm", format: "a4", compress: true });
  const cursor: PdfCursor = { doc, y: MARGIN_TOP };

  drawCover(cursor, meta, await loadLogo());

  documents.forEach((action, index) => {
    // Each action starts its own page: these are read one action at a time, and
    // a report that begins halfway down a page reads as a continuation.
    if (index > 0) {
      doc.addPage();
      cursor.y = MARGIN_TOP;
    }
    writeSpans(cursor, [{ text: action.actionName, bold: true }], {
      size: 15,
      gapAfter: 3,
    });

    for (const section of action.sections) {
      if (section.title) drawSectionTitle(cursor, section.title);
      for (const block of markdownToBlocks(section.markdown)) {
        drawBlock(cursor, block);
      }
      if (section.limitations.length > 0) {
        drawLimitations(cursor, meta.limitationsLabel, section.limitations);
      }
    }
  });

  drawFooters(doc, meta);
  return doc;
}
