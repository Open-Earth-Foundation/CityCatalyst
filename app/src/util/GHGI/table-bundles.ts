/**
 * Per-table bundles read from the stored structured OCR document
 * (`document.structured.json`): each table's cells with stable references,
 * its caption, nearby headings, unit and year notes, and the table it
 * continues. Pure module: no server imports.
 */
import type {
  NormalizedBlock,
  StructuredDocument,
} from "@/backend/StructuredDocumentArtifact";
import {
  KILOTONNE_PATTERNS,
  MIN_YEAR,
  TABLE_SEPARATOR,
  TONNE_UNIT_PATTERNS,
  namesKilogram,
  namesMegatonne,
  namesUnit,
  parseNumberString,
  yearsInLine,
} from "@/util/GHGI/source-text";

/**
 * `${tableId}:r${row}:c${col}`: row and col are 0-based over the whole grid,
 * header rows included.
 */
export type CellRef = string;

export type TableCell = { ref: CellRef; text: string; header: boolean };

export type TableBundle = {
  tableId: string;
  /** 1-based, as the Markdown `<!-- page: n -->` markers: `page_index + 1`. */
  page: number;
  caption: string | null;
  headings: string[];
  /** Caption, headings and header cells that name an emissions unit. */
  unitNotes: string[];
  /** Years in the caption, headings and header cells, 1990 to the current year. */
  yearNotes: number[];
  headerRowCount: number;
  grid: TableCell[][];
  /** The table on the previous page this one continues, or null. */
  continuationOf: string | null;
};

const MAX_HEADINGS = 2;

function cellRef(tableId: string, row: number, col: number): CellRef {
  return `${tableId}:r${row}:c${col}`;
}

/**
 * The cells of one Markdown table row. Outer pipes are dropped; an escaped
 * pipe `\|` stays inside its cell as `|`.
 */
function splitRow(line: string): string[] {
  const cells: string[] = [];
  let current = "";
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === "\\" && line[i + 1] === "|") {
      current += "|";
      i += 1;
    } else if (ch === "|") {
      cells.push(current);
      current = "";
    } else {
      current += ch;
    }
  }
  cells.push(current);
  const trimmed = line.trim();
  if (trimmed.startsWith("|")) cells.shift();
  if (trimmed.endsWith("|") && !trimmed.endsWith("\\|")) cells.pop();
  return cells.map((cell) => cell.trim());
}

/**
 * Reads a Markdown table into a grid of cells. Lines without `|` are skipped
 * and the first `| --- |` separator line is not a row; a later line of
 * `---` cells is a body row. Every row above the first separator is a
 * header row (OCR prints multi-row headers that way); a table
 * without a separator has no header rows.
 */
export function parseMarkdownTable(
  tableId: string,
  content: string,
): { grid: TableCell[][]; headerRowCount: number } {
  const rows: string[][] = [];
  let headerRowCount: number | null = null;
  for (const line of content.split(/\r?\n/)) {
    if (!line.includes("|")) continue;
    // Only the first separator is structural: a later `| --- |` line is a
    // body row ("n/a" cells), so it keeps its place and later refs stay put.
    if (headerRowCount == null && TABLE_SEPARATOR.test(line)) {
      headerRowCount = rows.length;
      continue;
    }
    rows.push(splitRow(line));
  }
  const headers = headerRowCount ?? 0;
  const grid = rows.map((cells, row) =>
    cells.map((text, col) => ({
      ref: cellRef(tableId, row, col),
      text,
      header: row < headers,
    })),
  );
  return { grid, headerRowCount: headers };
}

/** True when a caption, heading or header cell names kt, Mt, Gg, kg or tonnes. */
function namesEmissionsUnit(line: string): boolean {
  return (
    namesUnit(line, KILOTONNE_PATTERNS) ||
    namesMegatonne(line) ||
    namesKilogram(line) ||
    namesUnit(line, TONNE_UNIT_PATTERNS)
  );
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

/** True when a header cell holds a value: a number that is not a bare year. */
function isDataCell(text: string): boolean {
  const trimmed = text.trim();
  if (/^\d{4}$/.test(trimmed) && yearsInLine(trimmed).length > 0) return false;
  return parseNumberString(trimmed, "unknown") != null;
}

/**
 * A continuation table's header rows when one of them is data: OCR prints
 * every Markdown table with a header and separator, so the first row of a
 * continued table is usually its first data row. When a header row has a
 * number (not a bare year) in any cell but the first, the table gets no
 * header rows. Refs do not change.
 */
function demoteDataHeaderRows(parsed: {
  grid: TableCell[][];
  headerRowCount: number;
}): { grid: TableCell[][]; headerRowCount: number } {
  const dataHeader = parsed.grid
    .slice(0, parsed.headerRowCount)
    .some((cells) => cells.slice(1).some((cell) => isDataCell(cell.text)));
  if (!dataHeader) return parsed;
  return {
    grid: parsed.grid.map((cells) =>
      cells.map((cell) => ({ ...cell, header: false })),
    ),
    headerRowCount: 0,
  };
}

function columnCount(grid: TableCell[][]): number {
  return grid.reduce((max, row) => Math.max(max, row.length), 0);
}

/**
 * One bundle per table in the structured document, in page and table order.
 *
 * - `page` is `page_index + 1`.
 * - The caption is the block of a `caption_of_table` relationship whose
 *   `to_block_id` is the table's block (the block whose `related_table_id`
 *   is the table). A table with no such block has no caption or headings.
 * - Headings are up to 2 `heading`/`title` blocks before the table block in
 *   reading order on the same page, after the previous table's block (a
 *   heading of an earlier table does not attach to later ones), nearest last.
 * - `unitNotes` are the caption, headings and header cells that name a unit
 *   (the unit patterns of `source-text`); `yearNotes` are the years in them,
 *   from 1990 to `currentYear`.
 * - The first table on page p+1 continues the last table on page p when it
 *   has no caption, no heading or title block before it on its page (a
 *   heading starts a new table, as in stage 1) and the same column count.
 *   It then inherits the caption,
 *   and the previous table's unit and year notes come before its own.
 *   When one of its header rows has a number (not a bare year) in a cell
 *   other than the first, that row is data: the continuation gets
 *   `headerRowCount` 0 and no header cells (refs are unchanged).
 */
export function buildTableBundles(
  doc: StructuredDocument,
  currentYear: number = new Date().getFullYear(),
): TableBundle[] {
  const blocksById = new Map<string, NormalizedBlock>();
  for (const page of doc.document.pages) {
    for (const block of page.blocks) blocksById.set(block.block_id, block);
  }
  const captionByTableBlock = new Map<string, string>();
  for (const relationship of doc.document.relationships) {
    if (relationship.type !== "caption_of_table") continue;
    if (captionByTableBlock.has(relationship.to_block_id)) continue;
    const caption = blocksById.get(relationship.from_block_id);
    const text = caption?.content.trim();
    if (text) captionByTableBlock.set(relationship.to_block_id, text);
  }

  const bundles: TableBundle[] = [];
  let lastOfPreviousPage: TableBundle | null = null;
  const pages = [...doc.document.pages].sort(
    (a, b) => a.page_index - b.page_index,
  );
  for (const page of pages) {
    let lastOnPage: TableBundle | null = null;
    for (const [index, table] of page.tables.entries()) {
      const tableBlock = page.blocks.find(
        (block) => block.related_table_id === table.table_id,
      );
      const ownCaption = tableBlock
        ? (captionByTableBlock.get(tableBlock.block_id) ?? null)
        : null;
      const sectionStart = tableBlock
        ? Math.max(
            -1,
            ...page.blocks
              .filter(
                (block) =>
                  block.related_table_id != null &&
                  block.reading_order_index < tableBlock.reading_order_index,
              )
              .map((block) => block.reading_order_index),
          )
        : -1;
      const headings = tableBlock
        ? page.blocks
            .filter(
              (block) =>
                (block.normalized_type === "heading" ||
                  block.normalized_type === "title") &&
                block.reading_order_index > sectionStart &&
                block.reading_order_index < tableBlock.reading_order_index &&
                block.content.trim() !== "",
            )
            .sort((a, b) => a.reading_order_index - b.reading_order_index)
            .slice(-MAX_HEADINGS)
            .map((block) => block.content.trim())
        : [];
      const parsed = parseMarkdownTable(table.table_id, table.content ?? "");

      const candidate =
        index === 0 && lastOfPreviousPage?.page === page.page_index
          ? lastOfPreviousPage
          : null;
      const continued =
        candidate &&
        ownCaption == null &&
        headings.length === 0 &&
        parsed.grid.length > 0 &&
        columnCount(parsed.grid) === columnCount(candidate.grid)
          ? candidate
          : null;
      const { grid, headerRowCount } = continued
        ? demoteDataHeaderRows(parsed)
        : parsed;

      const headerCells = grid
        .flat()
        .filter((cell) => cell.header && cell.text !== "")
        .map((cell) => cell.text);
      const noteLines = [
        ...(ownCaption ? [ownCaption] : []),
        ...headings,
        ...headerCells,
      ];
      const ownUnitNotes = noteLines.filter(namesEmissionsUnit);
      const ownYearNotes = noteLines
        .flatMap(yearsInLine)
        .filter((year) => year >= MIN_YEAR && year <= currentYear);

      const bundle: TableBundle = {
        tableId: table.table_id,
        page: page.page_index + 1,
        caption: continued ? continued.caption : ownCaption,
        headings,
        unitNotes: unique([...(continued?.unitNotes ?? []), ...ownUnitNotes]),
        yearNotes: unique([...(continued?.yearNotes ?? []), ...ownYearNotes]),
        headerRowCount,
        grid,
        continuationOf: continued?.tableId ?? null,
      };
      bundles.push(bundle);
      lastOnPage = bundle;
    }
    lastOfPreviousPage = lastOnPage;
  }
  return bundles;
}

/**
 * The prompt rendering of a bundle: a `Table` line, then caption, headings,
 * unit, year and continuation lines when present, then one line per row with
 * each cell prefixed by its ref (`[t1:r2:c1] 1,200`). A `|` inside a cell is
 * written `\|`.
 */
export function bundleText(bundle: TableBundle): string {
  const lines = [`Table ${bundle.tableId} (page ${bundle.page})`];
  if (bundle.caption) lines.push(`Caption: ${bundle.caption}`);
  for (const heading of bundle.headings) lines.push(`Heading: ${heading}`);
  if (bundle.unitNotes.length > 0) {
    lines.push(`Units: ${bundle.unitNotes.join("; ")}`);
  }
  if (bundle.yearNotes.length > 0) {
    lines.push(`Years: ${bundle.yearNotes.join(", ")}`);
  }
  if (bundle.continuationOf) {
    lines.push(`Continues: ${bundle.continuationOf}`);
  }
  for (const row of bundle.grid) {
    lines.push(
      row
        .map((cell) => `[${cell.ref}] ${cell.text.replace(/\|/g, "\\|")}`)
        .join(" | "),
    );
  }
  return lines.join("\n");
}
