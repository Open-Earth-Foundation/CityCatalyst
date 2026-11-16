/**
 * Reads an emissions value from its table cell in code: the model names a
 * cell and the text it printed, and code checks that text is in the cell,
 * parses the number, works out the unit and converts to tonnes. The model's
 * own number and unit are not trusted. Pure module: no server imports.
 */
import {
  GIGAGRAM_PATTERNS,
  KILOTONNE_PATTERNS,
  MEGATONNE_PATTERNS,
  MIN_YEAR,
  THOUSAND_MT,
  TONNE_UNIT_PATTERNS,
  isNegativeAt,
  namesKilogram,
  namesMegatonne,
  namesPerPerson,
  namesUnit,
  parseNumberString,
  yearsInLine,
  type NumberStyle,
} from "@/util/GHGI/source-text";
import {
  continuationChain,
  type CellRef,
  type TableBundle,
  type TableCell,
} from "@/util/GHGI/table-bundles";

export type CellUnit = "t" | "kt" | "Mt" | "kg" | "Gg";

/** Tonnes per unit. */
export const CELL_UNIT_FACTOR: Record<CellUnit, number> = {
  t: 1,
  kt: 1000,
  Gg: 1000,
  Mt: 1000000,
  kg: 0.001,
};

export type CellRead =
  | {
      ok: true;
      tonnes: number;
      printed: string;
      unit: CellUnit | null;
      unitSource: "column" | "row" | "caption" | null;
      unitConflict: boolean;
      columnYear: number | null;
    }
  | {
      ok: false;
      reason: "no_cell" | "text_not_in_cell" | "not_a_number" | "per_person";
    };

type UnitSource = "column" | "row" | "caption";

/** Where a value was read: its table, 1-based page, and 0-based grid row and column. */
export type SourceCell = {
  tableId: string;
  page: number;
  row: number;
  col: number;
};

const KILOTONNE_ONLY_PATTERNS = KILOTONNE_PATTERNS.filter(
  (re) => !GIGAGRAM_PATTERNS.includes(re),
);

const LARGE_UNIT_GLOBAL = [...KILOTONNE_PATTERNS, ...MEGATONNE_PATTERNS].map(
  (re) =>
    new RegExp(re.source, re.flags.includes("g") ? re.flags : `${re.flags}g`),
);

/** Capital `MT` (`MT CO2e`, `MTCO2e`): metric tonnes or megatonnes (#3420). */
const AMBIGUOUS_MT = /\bMT(?:\b|(?=CO))/;

function collapse(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/** The units a line names, and whether it prints the ambiguous `MT`. */
function unitsInLine(line: string): { units: CellUnit[]; ambiguous: boolean } {
  const units: CellUnit[] = [];
  if (namesUnit(line, KILOTONNE_ONLY_PATTERNS)) units.push("kt");
  if (namesUnit(line, GIGAGRAM_PATTERNS)) units.push("Gg");
  if (namesMegatonne(line)) units.push("Mt");
  if (namesKilogram(line)) units.push("kg");
  // "thousand tonnes" and "million tonnes" name kt and Mt, not tonnes.
  const rest = LARGE_UNIT_GLOBAL.reduce((s, re) => s.replace(re, " "), line);
  if (namesUnit(rest, TONNE_UNIT_PATTERNS)) units.push("t");
  const ambiguous = AMBIGUOUS_MT.test(
    line.replace(new RegExp(THOUSAND_MT.source, "gi"), " "),
  );
  return { units, ambiguous };
}

type UnitLevel = { unit: CellUnit | null; conflict: boolean } | null;

/**
 * The unit the lines of one level name, or null when they name none. Units
 * with different factors are a conflict (kt and Gg are not: the first named
 * is kept); the ambiguous `MT` alone gives no unit and no conflict, and
 * beside another unit a conflict.
 */
function unitOfLevel(lines: string[]): UnitLevel {
  const units = new Set<CellUnit>();
  let ambiguous = false;
  for (const line of lines) {
    const found = unitsInLine(line);
    found.units.forEach((unit) => units.add(unit));
    ambiguous ||= found.ambiguous;
  }
  if (ambiguous) return { unit: null, conflict: units.size > 0 };
  if (units.size === 0) return null;
  const factors = new Set([...units].map((unit) => CELL_UNIT_FACTOR[unit]));
  if (factors.size > 1) return { unit: null, conflict: true };
  return { unit: [...units][0], conflict: false };
}

/**
 * The cell `ref` names in `bundles`, with its bundle and grid position, or
 * null when the ref is malformed or no bundle has that cell.
 */
export function findCell(
  bundles: TableBundle[],
  ref: CellRef,
): { bundle: TableBundle; row: number; col: number; cell: TableCell } | null {
  const match = /^(.*):r(\d+):c(\d+)$/.exec(ref);
  if (!match) return null;
  const [, tableId, rowText, colText] = match;
  const row = Number(rowText);
  const col = Number(colText);
  for (const bundle of bundles) {
    if (bundle.tableId !== tableId) continue;
    const cell = bundle.grid[row]?.[col];
    if (cell && cell.ref === ref) return { bundle, row, col, cell };
  }
  return null;
}

/**
 * The start of `printed` in `cellText` as a whole number: not inside a longer
 * number (`559` in `9,559.2`, `215` in `9 559 215`; `.`, `,`, a space, NBSP,
 * narrow NBSP or `'` between digits joins them). -1 when there is none.
 */
function wholeNumberIndex(cellText: string, printed: string): number {
  for (
    let i = cellText.indexOf(printed);
    i !== -1;
    i = cellText.indexOf(printed, i + 1)
  ) {
    const before = cellText.slice(Math.max(0, i - 2), i);
    const after = cellText.slice(i + printed.length, i + printed.length + 2);
    // cellText is whitespace-collapsed: a NBSP or narrow NBSP is a space here.
    const joinedBefore = /\d$|\d[.,\s']$/.test(before);
    const joinedAfter = /^\d|^[.,\s']\d/.test(after);
    if (!joinedBefore && !joinedAfter) return i;
  }
  return -1;
}

/** The single year (1990 to `currentYear`) in header cells, or null. */
function yearOfColumn(headers: string[], currentYear: number): number | null {
  const years = new Set(
    headers
      .flatMap(yearsInLine)
      .filter((year) => year >= MIN_YEAR && year <= currentYear),
  );
  return years.size === 1 ? [...years][0] : null;
}

function headersOfColumn(bundle: TableBundle, col: number): string[] {
  return bundle.grid
    .slice(0, bundle.headerRowCount)
    .map((cells) => cells[col]?.text ?? "")
    .filter((text) => text !== "");
}

/** True when header lines name a unit, the ambiguous `MT` or a per-person unit. */
function namesColumnUnit(headers: string[]): boolean {
  return headers.some(namesPerPerson) || unitOfLevel(headers) != null;
}

/**
 * Reads the value of the cell `ref` in tonnes.
 *
 * 1. `no_cell`: no ref, no such cell in `bundles`, or a header cell.
 * 2. `text_not_in_cell`: `printedText` (whitespace collapsed, `−` read as
 *    `-` in both) is empty or is not in the cell text as a whole number (not
 *    `559` of `9,559.2`, not `215` of `9 559 215`).
 * 3. Column headers: the cell's column headers in its table; when they name
 *    no unit and the table continues another (`continuationOf`), the same
 *    column's headers in the first table up the chain that names one.
 *    `per_person`: those headers name a per-person unit (`/capita`,
 *    `per capita`, `per person`, `per cápita`, `pro Kopf`).
 * 4. The number is parsed from the cell with `style`: the whole cell, or else
 *    the printed text with the cell's sign (`(811,512)`, `−603,983 (a)`).
 *    `not_a_number` when neither parses (`NE`).
 * 5. Unit: the column's header cells, then the row's first cell, then the
 *    caption, headings and `unitNotes` without any header cell text of the
 *    continuation chain (other columns' units are not caption evidence); the first level that
 *    names a unit decides (`unitSource`). Units with different factors at
 *    that level give `unit: null` and `unitConflict: true` (kt and Gg do
 *    not conflict); a capital `MT` (metric tonnes or megatonnes) gives
 *    `unit: null` without a conflict. With `unit: null` the value is kept as
 *    tonnes; `unitSource` is null only when no level names a unit.
 * 6. `columnYear`: the one year (1990 to `currentYear`) in the column's
 *    header cells, up the continuation chain, else null.
 */
export function readCell(
  bundles: TableBundle[],
  ref: CellRef | null | undefined,
  printedText: string | null | undefined,
  style: NumberStyle,
  currentYear: number = new Date().getFullYear(),
): CellRead {
  if (!ref) return { ok: false, reason: "no_cell" };
  const found = findCell(bundles, ref);
  if (!found || found.cell.header) return { ok: false, reason: "no_cell" };
  const { bundle, row, col, cell } = found;

  // The Unicode minus (U+2212) is read as `-` in both texts.
  const cellText = collapse(cell.text).replace(/−/g, "-");
  const printed = collapse(printedText ?? "").replace(/−/g, "-");
  const start = printed === "" ? -1 : wholeNumberIndex(cellText, printed);
  if (start === -1) return { ok: false, reason: "text_not_in_cell" };

  // A continuation's column takes its unit and year from the first table of
  // the chain whose header for that column names them.
  const chain = continuationChain(bundles, bundle);
  const chainHeaders = chain.map((b) => headersOfColumn(b, col));
  const headers = chainHeaders.find(namesColumnUnit) ?? chainHeaders[0];
  if (headers.some(namesPerPerson)) return { ok: false, reason: "per_person" };
  const columnYear =
    chainHeaders
      .map((h) => yearOfColumn(h, currentYear))
      .find((year) => year != null) ?? null;

  let value = parseNumberString(cellText, style);
  if (value == null) {
    const own = parseNumberString(printed, style);
    if (own != null) {
      const negative =
        own < 0 || isNegativeAt(cellText, start, start + printed.length);
      value = negative ? -Math.abs(own) : own;
    }
  }
  if (value == null) return { ok: false, reason: "not_a_number" };

  const rowLabel = col > 0 ? (bundle.grid[row][0]?.text ?? "") : "";
  // `unitNotes` also holds the header cells of this table and of the tables
  // it continues; those of other columns are not caption evidence, so only
  // the caption, headings and the other notes are read at the caption level.
  const chainHeaderTexts = new Set(
    chain.flatMap((b) =>
      b.grid
        .slice(0, b.headerRowCount)
        .flat()
        .map((headerCell) => headerCell.text),
    ),
  );
  const levels: [UnitSource, string[]][] = [
    ["column", headers],
    ["row", rowLabel ? [rowLabel] : []],
    [
      "caption",
      [
        ...(bundle.caption ? [bundle.caption] : []),
        ...bundle.headings,
        ...bundle.unitNotes.filter((note) => !chainHeaderTexts.has(note)),
      ],
    ],
  ];
  let unit: CellUnit | null = null;
  let unitSource: UnitSource | null = null;
  let unitConflict = false;
  for (const [source, lines] of levels) {
    const level = unitOfLevel(lines);
    if (!level) continue;
    unit = level.unit;
    unitConflict = level.conflict;
    unitSource = source;
    break;
  }

  const factor = unit ? CELL_UNIT_FACTOR[unit] : 1;
  return {
    ok: true,
    // toPrecision drops float noise: 9559.2 * 1000 is 9559200, not 9559199.999….
    tonnes: Number((value * factor).toPrecision(15)),
    printed,
    unit,
    unitSource,
    unitConflict,
    columnYear,
  };
}
