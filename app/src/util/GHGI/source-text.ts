/**
 * Helpers for reading numbers printed in source text (PDF pages or documents).
 * Pure module: no server imports.
 */

export type NumberStyle = "european" | "english" | "unknown";

const EUROPEAN_PATTERNS = [
  /(?<![\d.,])\d{1,3}(?:\.\d{3}){2,}(?![\d]|[.,]\d)/g,
  /(?<![\d.,])\d{1,3}(?:\.\d{3})+,\d+(?![\d]|[.,]\d)/g,
];
const ENGLISH_PATTERNS = [
  /(?<![\d.,])\d{1,3}(?:,\d{3}){2,}(?![\d]|[.,]\d)/g,
  /(?<![\d.,])\d{1,3}(?:,\d{3})+\.\d+(?![\d]|[.,]\d)/g,
];

function countMatches(text: string, patterns: RegExp[]): number {
  return patterns.reduce((n, re) => n + (text.match(re)?.length ?? 0), 0);
}

/**
 * Counts unambiguous european (`1.234.567`, `1.234,5`) and english
 * (`1,234,567`, `1,234.5`) numbers. The larger count wins; a tie or no
 * evidence is "unknown".
 */
export function detectNumberStyle(text: string): NumberStyle {
  const { european, english } = countNumberStyles(text);
  if (european > english) return "european";
  if (english > european) return "english";
  return "unknown";
}

/** Counts of unambiguous european and english numbers in `text`. */
export function countNumberStyles(text: string): {
  european: number;
  english: number;
} {
  return {
    european: countMatches(text, EUROPEAN_PATTERNS),
    english: countMatches(text, ENGLISH_PATTERNS),
  };
}

/** First group 1-3 digits, every following group exactly 3 digits. */
function isGroupedInteger(s: string, sep: string): boolean {
  const parts = s.split(sep);
  if (!/^\d{1,3}$/.test(parts[0])) return false;
  return parts.slice(1).every((p) => /^\d{3}$/.test(p));
}

/**
 * Parses a number string with decimal and thousands separators.
 *
 * 1. Trim. Remove spaces, NBSP, narrow NBSP and `'` used as group separators.
 * 2. Sign: a leading `-` or `−`, or a value in parentheses, is negative; a
 *    leading `+` is dropped. A trailing unit (`1234 tCO2e`) or `%` is dropped.
 * 3. Both `.` and `,` present: the rightmost is the decimal separator and the
 *    other is the group separator (`1.234,5` and `1,234.5` are 1234.5),
 *    whatever the style.
 * 4. Only one kind of separator, used more than once: group separator
 *    (`1,234,567` and `1.234.567` are 1234567).
 * 5. One separator followed by a group of anything other than exactly 3
 *    digits: decimal (`1,5` is 1.5, `12,25` is 12.25, `1.5` is 1.5).
 * 6. One separator followed by exactly 3 digits is ambiguous:
 *    - english or unknown: comma is a group separator, dot is decimal
 *      (`1,500` is 1500, `1.500` is 1.5);
 *    - european: dot is a group separator, comma is decimal
 *      (`1.500` is 1500, `1,500` is 1.5).
 *    With style unknown, `onAmbiguous` is called with the input.
 * 7. Anything else (letters, several decimal marks, malformed groups): null.
 */
export function parseNumberString(
  s: string,
  style: NumberStyle,
  onAmbiguous?: (s: string) => void,
): number | null {
  let t = s.trim().replace(/[ \u00a0\u202f']/g, "");
  let negative = false;
  const paren = /^\((.*)\)$/.exec(t);
  if (paren) {
    negative = true;
    t = paren[1];
  }
  if (t.startsWith("+")) {
    t = t.slice(1);
  } else if (t.startsWith("-") || t.startsWith("\u2212")) {
    negative = true;
    t = t.slice(1);
  }
  // Scientific notation (`1.5e3`, `9E+2`), as some providers return, is read
  // before units are dropped, so the exponent is not taken for a unit.
  const scientific =
    /^(\d+(?:\.\d+)?[eE][+-]?\d+)(?:[A-Za-z][A-Za-z0-9₂/]*)?$/.exec(t);
  if (scientific) {
    const value = Number(scientific[1]);
    if (!Number.isFinite(value)) return null;
    return negative ? -value : value;
  }
  // A trailing unit (`tCO2e`, `kg`) or `%` after the last digit is dropped.
  t = t.replace(/%$/, "").replace(/(?<=\d)[A-Za-z][A-Za-z0-9\u2082/]*$/, "");
  if (!/^\d[\d.,]*\d$|^\d$/.test(t)) return null;

  const dots = t.split(".").length - 1;
  const commas = t.split(",").length - 1;
  let result: number | null;

  if (dots > 0 && commas > 0) {
    const decimal = t.lastIndexOf(".") > t.lastIndexOf(",") ? "." : ",";
    const group = decimal === "." ? "," : ".";
    const idx = t.lastIndexOf(decimal);
    const intPart = t.slice(0, idx);
    const frac = t.slice(idx + 1);
    if (intPart.includes(decimal) || !/^\d+$/.test(frac)) return null;
    if (!isGroupedInteger(intPart, group)) return null;
    result = Number(`${intPart.split(group).join("")}.${frac}`);
  } else if (dots === 0 && commas === 0) {
    result = Number(t);
  } else {
    const sep = dots > 0 ? "." : ",";
    const count = dots > 0 ? dots : commas;
    if (count > 1) {
      if (!isGroupedInteger(t, sep)) return null;
      result = Number(t.split(sep).join(""));
    } else {
      const [before, after] = t.split(sep);
      if (!/^\d+$/.test(before) || !/^\d+$/.test(after)) return null;
      let isGroup = false;
      if (after.length === 3) {
        isGroup = style === "european" ? sep === "." : sep === ",";
        if (style === "unknown") onAmbiguous?.(s);
      }
      if (isGroup) {
        if (!isGroupedInteger(t, sep)) return null;
        result = Number(before + after);
      } else {
        result = Number(`${before}.${after}`);
      }
    }
  }

  if (result === null || !Number.isFinite(result)) return null;
  return negative ? -result : result;
}

/** A number token: digits with `.` or `,` inside, never at an end. */
const NUMBER_TOKEN = /\d(?:[\d.,]*\d)?/g;

/** A run grouped by spaces: `9 559 215`, `1 234,5` (space, NBSP, narrow NBSP). */
const SPACE_GROUPED =
  /(?<![\d.,])\d{1,3}(?:[ \u00a0\u202f]\d{3})+(?:[.,]\d+)?(?![\d]|[.,]\d)/g;

/** Place value of the last digit of `token`, which parses as `value`. */
function lastDigitStep(token: string, value: number): number {
  const digits = Number(token.replace(/\D/g, ""));
  if (value === 0 || digits === value) return 1;
  return 10 ** -Math.round(Math.log10(digits / value));
}

/**
 * True when the number printed at `text[start, end)` is negative: a Unicode
 * minus right before it, a `-` right before it that does not join two words or
 * numbers (`2019-2021`, `CO2-e`), or parentheses around it alone (`(811,512)`).
 */
export function isNegativeAt(
  text: string,
  start: number,
  end: number,
): boolean {
  const before = text.slice(0, start).replace(/[   ]+$/, "");
  const after = text.slice(end).replace(/^[   ]+/, "");
  if (before.endsWith("−")) return true;
  if (text[start - 1] === "-" && !/[\p{L}\d]/u.test(text[start - 2] ?? "")) {
    return true;
  }
  return before.endsWith("(") && after.startsWith(")");
}

/**
 * Every number printed in `text`, parsed with `style`, with its sign:
 * `(811,512)` and `−603,983` read as -811512 and -603983. `step` is the place
 * value of the last digit (1 for `9,559`, 0.1 for `9,559.2`). A space-grouped
 * run (`9 559 215`) yields the merged number and each token on its own. Tokens
 * that do not parse with the style are skipped.
 */
export function numbersInText(
  text: string,
  style: NumberStyle,
): { value: number; step: number }[] {
  return readNumbers(text, style, [NUMBER_TOKEN, SPACE_GROUPED]);
}

function readNumbers(
  text: string,
  style: NumberStyle,
  patterns: RegExp[],
): { value: number; step: number }[] {
  const found: { value: number; step: number }[] = [];
  const add = (match: RegExpMatchArray) => {
    const token = match[0];
    const value = parseNumberString(token, style);
    if (value == null) return;
    const abs = Math.abs(value);
    const start = match.index ?? 0;
    const negative = isNegativeAt(text, start, start + token.length);
    found.push({
      value: negative ? -abs : abs,
      step: lastDigitStep(token, abs),
    });
  };
  for (const re of patterns) {
    for (const match of text.matchAll(re)) add(match);
  }
  return found;
}

/**
 * numbersInText restricted to lines containing `|`: the numbers printed in
 * Markdown tables, not in prose.
 */
export function numbersOnTableLines(
  text: string,
  style: NumberStyle,
): { value: number; step: number }[] {
  const tableText = text
    .split(/\r?\n/)
    .filter((line) => line.includes("|"))
    .join("\n");
  return numbersInText(tableText, style);
}

/**
 * A number token standing alone: not attached to a letter, dot or digit, so
 * the "2" of `CO2e` and the `1.1` of the reference `I.1.1` are left out.
 */
const STANDALONE_NUMBER_TOKEN =
  /(?<![\p{L}.,\d])\d(?:[\d.,]*\d)?(?![\p{L}.\d]|,\d)/gu;

/**
 * The numbers in the body cells of Markdown tables: numbersOnTableLines
 * without header rows (the `|` line above a `| --- |` separator), separator
 * lines, and tokens attached to letters or dots (`CO2e`, `I.1.1`). Used for the
 * short scaled matches of `isLineItemValueInNumbers`.
 */
export function numbersInTableCells(
  text: string,
  style: NumberStyle,
): { value: number; step: number }[] {
  const lines = text.split(/\r?\n/);
  const cellText = lines
    .filter(
      (line, i) =>
        line.includes("|") &&
        !TABLE_SEPARATOR.test(line) &&
        !(i + 1 < lines.length && TABLE_SEPARATOR.test(lines[i + 1])),
    )
    .join("\n");
  return readNumbers(cellText, style, [STANDALONE_NUMBER_TOKEN]);
}

/**
 * A factor the model may apply to a printed figure to get tonnes: ×1000 for kt
 * or Gg, ×1,000,000 for Mt, ×0.001 for kg (Santiago 2022 prints kg). A scale
 * applies only when the page names its unit: see `pageScaleEvidence`.
 */
export type Scale = 0.001 | 1000 | 1000000;

/** A printed figure needs this many significant digits to match scaled. */
const MIN_SCALED_DIGITS = 4;

/** Significant digits of a printed figure: `9,559.2` has 5, `9.56` has 3. */
function significantDigits(value: number, step: number): number {
  const digits = Math.round(value / step);
  return digits === 0 ? 0 : String(digits).length;
}

/**
 * True when `raw` (a model value before unit conversion) is printed in `text`:
 * equal up to rounding of the printed figure, or the printed figure times one of
 * `scales` up to its rounding. `scales` come from the page's unit evidence
 * (`pageScaleEvidence`); without them only an unscaled match counts, so a total
 * cannot match an unrelated number through ×1000. The sign must match: 25,639 is
 * not found in `(25,639)` or `−25,639`.
 *
 * A scaled match needs a printed figure of at least 4 significant digits
 * (`9,559.2` kt matches 9,559,215 t). Shorter figures would match almost any
 * total: "9.56 million" stands for ±5,000 t and the "2" of "CO2e" for ±500,000 t.
 * A rounded figure then leaves the total unfound, and the review gives no verdict.
 */
export function isValueInText(
  raw: number,
  text: string,
  style: NumberStyle = detectNumberStyle(text),
  scales: readonly Scale[] = [],
): boolean {
  return isValueInNumbers(raw, numbersInText(text, style), scales);
}

/**
 * isValueInText against numbers already read with `numbersInText`, so a caller
 * checking many values reads the text once.
 */
export function isValueInNumbers(
  raw: number,
  numbers: { value: number; step: number }[],
  scales: readonly Scale[] = [],
): boolean {
  return matchesPrinted(raw, numbers, scales, MIN_SCALED_DIGITS);
}

/**
 * isValueInNumbers for a line item. `numbers` are all the numbers of the text
 * and `tableNumbers` those in its Markdown table body cells
 * (`numbersInTableCells`). Exact matches and scaled matches of 4+ significant
 * digits count anywhere, as in isValueInNumbers. A shorter figure matches
 * scaled only in a table body cell: `| Manufacturing | 80.3 |` under a
 * "thousand MT CO2e" caption matches 80,300 t, but the "2" of "CO2e" (in prose
 * or a header row) does not match 2,000 t, nor the `1.1` of `I.1.1` 1,100 t. `scales`
 * come from the page's unit evidence (`pageScaleEvidence`, or a previous
 * page's through `inheritedPageScales`); without them only an unscaled match
 * counts. Reported totals keep isValueInNumbers and its 4-digit guard.
 */
export function isLineItemValueInNumbers(
  raw: number,
  numbers: { value: number; step: number }[],
  tableNumbers: { value: number; step: number }[],
  scales: readonly Scale[] = [],
): boolean {
  return (
    matchesPrinted(raw, numbers, scales, MIN_SCALED_DIGITS) ||
    matchesPrinted(raw, tableNumbers, scales, 0)
  );
}

function matchesPrinted(
  raw: number,
  numbers: { value: number; step: number }[],
  scales: readonly Scale[],
  minScaledDigits: number,
): boolean {
  return numbers.some(
    ({ value, step }) =>
      Math.sign(raw) * Math.sign(value) >= 0 &&
      (Math.abs(raw - value) <= Math.max(0.5, step / 2) ||
        (significantDigits(Math.abs(value), step) >= minScaledDigits &&
          scales.some((m) => Math.abs(raw - value * m) <= (step * m) / 2))),
  );
}

/** Markdown separator line under a table header: `| --- | :---: |`. */
export const TABLE_SEPARATOR =
  /^\s*\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)*\|?\s*$/;

/** A short line made of a parenthesized phrase: `(kt CO2e)`, `Total (tonnes CO2e)`. */
function isUnitLine(line: string): boolean {
  return (
    line.length <= 80 &&
    !line.startsWith("|") &&
    !line.endsWith(".") &&
    /\([^()]+\)/.test(line)
  );
}

type CaptionLine = { text: string; table: boolean; line: number };

function classifyCaptionLines(text: string): CaptionLine[] {
  const lines = text.split(/\r?\n/);
  const found: CaptionLine[] = [];
  lines.forEach((raw, i) => {
    const line = raw.trim();
    if (!line) return;
    // Figure captions first: `## Figure 2: Emissions 2019` is a heading, but
    // it describes a chart, not the table next to it.
    if (/^[\s#*_>]*figure\b/i.test(line)) {
      found.push({ text: line, table: false, line: i });
    } else if (/^[\s#*_>]*table\b/i.test(line) || line.startsWith("#")) {
      found.push({ text: line, table: true, line: i });
    } else if (
      line.includes("|") &&
      i + 1 < lines.length &&
      lines[i + 1].includes("|") &&
      lines[i + 1].includes("-") &&
      TABLE_SEPARATOR.test(lines[i + 1])
    ) {
      found.push({ text: line, table: true, line: i });
    } else if (isUnitLine(line)) {
      found.push({ text: line, table: false, line: i });
    }
  });
  return found;
}

/**
 * Lines that describe a table: `Table` and `Figure` captions, markdown headings,
 * markdown table header rows (the `|` line above a `| --- |` separator) and short
 * parenthesized unit lines. Prose lines never count.
 */
export function captionLines(text: string): string[] {
  return classifyCaptionLines(text).map((l) => l.text);
}

/**
 * The subset of `captionLines` used for year evidence: `Table` captions, markdown
 * headings and table header rows. Figure captions and unit lines are left out.
 */
export function tableCaptionLines(text: string): string[] {
  return classifyCaptionLines(text)
    .filter((l) => l.table)
    .map((l) => l.text);
}

export type YearEvidence = {
  kind: "target" | "other" | "none";
  years: number[];
  /**
   * For `other`: the page text above the first caption that names another year.
   * A table continued from the previous page sits there (Rosario 2022 p. 55: the
   * end of the 2022 table, then "Tabla de Resultados Inventario 2021"). Empty
   * otherwise.
   */
  leadText: string;
};

export const MIN_YEAR = 1990;
const MAX_YEAR = 2100;
const PROJECTION_WORDS =
  /target|projection|goal|forecast|scenario|pathway|\bby\s+20\d\d/i;
/** A line dated by the report itself: every year on it but the target is ignored. */
const DATE_LINE_WORDS = /\b(?:published|prepared|updated|revised)\b/i;

/** A range with a 4-digit second year: `2005–2019`, `2016 to 2019`. */
const YEAR_RANGE = /(?<!\d)\d{4}\s*(?:[–—-]|to)\s*\d{4}(?!\d)/gi;

/** One word before the year (optionally then "the") that makes it a comparison year. */
const GOVERNING_WORDS = new Set(["since", "from", "vs", "versus"]);
/** Two words before the year (optionally then "the"). */
const GOVERNING_PAIRS = new Set([
  "compared with",
  "compared to",
  "relative to",
]);
/** A baseline year is any year within this many words of "baseline" or "base year". */
const BASELINE_WINDOW = 3;

/**
 * Blanks the years a comparison word governs, so they are not read as the table
 * year: a year right after since, from, vs, versus, compared with/to or relative
 * to (optionally after "the"), and a year within 3 words of "baseline" or "base
 * year". "Emissions from transport 2019" keeps its year. Ranges are blanked
 * first, so "from 2016 to 2019" stays a range.
 */
function blankGovernedYears(line: string): string {
  const text = line.replace(YEAR_RANGE, (m) => " ".repeat(m.length));
  const words = [...text.matchAll(/\p{L}+|\d+/gu)].map((m) => ({
    word: m[0].toLowerCase(),
    index: m.index ?? 0,
  }));
  const anchors: { start: number; end: number }[] = [];
  words.forEach((w, i) => {
    if (w.word === "baseline") anchors.push({ start: i, end: i });
    if (w.word === "base" && words[i + 1]?.word === "year") {
      anchors.push({ start: i, end: i + 1 });
    }
  });
  const governed = (i: number): boolean => {
    let j = i - 1;
    if (words[j]?.word === "the") j--;
    if (j >= 0 && GOVERNING_WORDS.has(words[j].word)) return true;
    if (
      j >= 1 &&
      GOVERNING_PAIRS.has(`${words[j - 1].word} ${words[j].word}`)
    ) {
      return true;
    }
    return anchors.some(
      (a) =>
        (i < a.start && a.start - i <= BASELINE_WINDOW) ||
        (i > a.end && i - a.end <= BASELINE_WINDOW),
    );
  };
  let out = text;
  words.forEach((w, i) => {
    if (!/^\d{4}$/.test(w.word) || !governed(i)) return;
    out = out.slice(0, w.index) + "    " + out.slice(w.index + w.word.length);
  });
  return out;
}

/** Years named on one caption line, fiscal forms counting for both years. */
export function yearsInLine(line: string): number[] {
  const years: number[] = [];
  let rest = line;
  // A range with a 4-digit second year is a trend, not the table year.
  rest = rest.replace(YEAR_RANGE, " ");
  // Fiscal forms: 2021/22, 2021-22 (second part is first + 1), FY21.
  rest = rest.replace(
    /(?<!\d)(\d{4})\s*[/\u2013\u2014-]\s*(\d{2})(?!\d)/g,
    (m, a, b) => {
      const first = Number(a);
      if (Number(b) !== (first + 1) % 100) return m;
      years.push(first, first + 1);
      return " ";
    },
  );
  rest = rest.replace(/\bFY\s?(\d{4}|\d{2})(?!\d)/gi, (_m, yy: string) => {
    const end = yy.length === 2 ? 2000 + Number(yy) : Number(yy);
    years.push(end - 1, end);
    return " ";
  });
  for (const m of rest.matchAll(/(?<!\d)(\d{4})(?!\d)/g)) {
    years.push(Number(m[1]));
  }
  return years.filter((y) => y >= MIN_YEAR && y <= MAX_YEAR);
}

/**
 * Which year the page's table captions name. `target`: some caption names the
 * target year (a fiscal form counts for both its years). `other`: captions name
 * years, none is the target; `years` lists them in order of appearance. `none`:
 * no year in captions. Year ranges, projection years on target/goal/forecast
 * lines and years after `currentYear` are ignored. So are years a comparison
 * word governs ("since 2016", "compared with 2016", "the 2016 baseline"), and,
 * on a published/prepared/updated/revised line, every year but the target.
 */
export function yearEvidence(
  text: string,
  targetYear: number,
  currentYear: number,
): YearEvidence {
  const kept: number[] = [];
  let firstOtherLine: number | null = null;
  for (const caption of classifyCaptionLines(text)) {
    if (!caption.table) continue;
    const line = caption.text;
    const projection = PROJECTION_WORDS.test(line);
    const dated = DATE_LINE_WORDS.test(line);
    for (const y of yearsInLine(blankGovernedYears(line))) {
      if (y !== targetYear && dated) continue;
      if (y > targetYear && projection) continue;
      if (y > currentYear && y !== targetYear) continue;
      if (y !== targetYear && firstOtherLine == null) {
        firstOtherLine = caption.line;
      }
      if (!kept.includes(y)) kept.push(y);
    }
  }
  const years = kept.filter((y) => y !== targetYear);
  if (kept.includes(targetYear)) return { kind: "target", years, leadText: "" };
  if (kept.length > 0) {
    const leadText = text
      .split(/\r?\n/)
      .slice(0, firstOtherLine ?? 0)
      .join("\n");
    return { kind: "other", years, leadText };
  }
  return { kind: "none", years, leadText: "" };
}

/** "thousand MT", "thousand mt", "thousand MTCO2e": kt, not an MT or Mt unit. */
export const THOUSAND_MT = /\bthousand\s+mt(?:\b|(?=co))/i;

/** Gg and gigagrams: the scale of kt. */
export const GIGAGRAM_PATTERNS: RegExp[] = [/\bGg\b/, /\bgigagrams?\b/i];

/** kt and its equivalents, Gg included (`GIGAGRAM_PATTERNS`). */
export const KILOTONNE_PATTERNS: RegExp[] = [
  /\bktCO(?:2|₂)/i,
  /\bkt\b/i,
  /\bkilotonnes?\b/i,
  /\bkilotons?\b/i,
  /\bthousand\s+(?:metric\s+)?(?:tonnes?|tons?)\b/i,
  // "thousand MT CO2e" (Phoenix 2022): MT is metric tonnes, so this is kt.
  THOUSAND_MT,
  ...GIGAGRAM_PATTERNS,
];

/**
 * The `Mt` symbol. Case-sensitive ("Mt Eden" is a place); it counts only
 * before a CO2 or tonnes word, or alone in parentheses.
 */
const MT_SYMBOL_PATTERNS: RegExp[] = [
  /\bMt[\s-]*(?:CO2|CO₂|tonnes?\b|tons?\b)/,
  /\(\s*Mt(?:[\s-]*CO(?:2|₂)[^)]*)?\s*\)/,
];

export const MEGATONNE_PATTERNS: RegExp[] = [
  /\bmillion\s+(?:metric\s+)?(?:tonnes?|tons?)\b/i,
  /\bmegatonnes?\b/i,
  /\bmegatons?\b/i,
  ...MT_SYMBOL_PATTERNS,
];

const LARGE_UNIT_PATTERNS: RegExp[] = [
  ...KILOTONNE_PATTERNS,
  ...MEGATONNE_PATTERNS,
];

const KILOGRAM_PATTERNS: RegExp[] = [
  /\bkgCO(?:2|₂)/i,
  /\bkg\b/i,
  /\bkilograms?\b/i,
  /\bkilogrammes?\b/i,
];

/** A tonne unit: t, tCO2e, tCO2-e, tonnes, tons, metric tonnes (not kt or Mt). */
export const TONNE_UNIT_PATTERNS: RegExp[] = [
  /(?<![\w.])t(?:\s*CO(?:2|₂)(?:-?e)?)?\b/,
  /\b(?:metric\s+)?(?:tonnes?|tons?)\b/i,
];

/**
 * The per-person part of a unit: `/capita`, `per capita`, `per person`,
 * `per cápita`, `/hab.`, `per head`, `pro Kopf`.
 */
const PER_PERSON_TAIL = String.raw`(?:(?:\/\s*|(?<!\p{L})per\s+)(?:capita|cápita|person|inhabitant|hab(?:itante)?\.?|head)(?!\p{L})|(?<!\p{L})pro\s+Kopf(?!\p{L}))`;

/**
 * A per-person kg figure (`kg/capita`, `kg CO2e per person`, `kg per cápita`,
 * `kg CO2e/hab.`, `kg per head`, `kg pro Kopf`):
 * a column of an emissions-per-capita table, not the unit of the emissions.
 * `per` must start a word, so the joined form `kgper capita` does not match.
 */
const PER_PERSON_KG = new RegExp(
  String.raw`\b(?:kg|kilograms?|kilogrammes?)(?:\s*CO(?:2|₂)(?:-?e(?:q)?)?)?\s*` +
    PER_PERSON_TAIL,
  "giu",
);

const PER_PERSON_UNIT = new RegExp(PER_PERSON_TAIL, "iu");

/** True when a line names a per-person unit of any size (`t CO2e / capita`, `kg pro Kopf`). */
export function namesPerPerson(line: string): boolean {
  return PER_PERSON_UNIT.test(line);
}

export function namesUnit(line: string, patterns: RegExp[]): boolean {
  return patterns.some((re) => re.test(line));
}

/** namesUnit for Mt; "thousand Mt CO2e" names kt, so it is left out. */
export function namesMegatonne(line: string): boolean {
  return namesUnit(
    line.replace(new RegExp(THOUSAND_MT.source, "gi"), " "),
    MEGATONNE_PATTERNS,
  );
}

/**
 * True when the page spells the `Mt` symbol on a caption line ("(Mt CO2e)",
 * "Mt CO2"), with the rules of `namesLargeUnit`. "million tonnes",
 * "megatonnes" and "thousand Mt" do not count.
 */
export function namesMtSymbol(text: string): boolean {
  return captionsNameUnit(text, lineNamesMtSymbol);
}

/**
 * True when one line (a caption, a table header cell) spells the `Mt` symbol.
 * "thousand Mt" does not count.
 */
export function lineNamesMtSymbol(line: string): boolean {
  return namesUnit(
    line.replace(new RegExp(THOUSAND_MT.source, "gi"), " "),
    MT_SYMBOL_PATTERNS,
  );
}

/** namesUnit for kg, with per-person kg mentions left out. */
export function namesKilogram(line: string): boolean {
  return namesUnit(line.replace(PER_PERSON_KG, " "), KILOGRAM_PATTERNS);
}

/**
 * True when `names` finds the unit on a caption line. A Table caption,
 * heading or table header row counts on its own. A Figure caption or a short unit
 * line counts only when no Table caption, heading or header row names a tonne
 * unit: a figure in kt beside a table in tonnes leaves the table in tonnes.
 * Prose is ignored, so "about 3 kt of waste" does not count.
 */
function captionsNameUnit(
  text: string,
  names: (line: string) => boolean,
): boolean {
  const lines = classifyCaptionLines(text);
  const tableLines = lines.filter((l) => l.table).map((l) => l.text);
  if (tableLines.some(names)) return true;
  const other = lines.some((l) => !l.table && names(l.text));
  return (
    other && !tableLines.some((line) => namesUnit(line, TONNE_UNIT_PATTERNS))
  );
}

/**
 * True when the page names kt, Mt, Gg or an equivalent large unit on a caption
 * line (see `captionsNameUnit` for the line rules).
 */
export function namesLargeUnit(text: string): boolean {
  return captionsNameUnit(text, (line) => namesUnit(line, LARGE_UNIT_PATTERNS));
}

/** `line` with its large-unit phrases blanked ("thousand tonnes", "Mt CO2"). */
function withoutLargeUnits(line: string): string {
  return LARGE_UNIT_PATTERNS.reduce(
    (out, re) => out.replace(new RegExp(re.source, `${re.flags}g`), " "),
    line,
  );
}

/** "metric ton", "metric tons", "metric tonne(s)", in any case. */
const METRIC_TON = String.raw`metric\s+ton(?:ne)?s?\b`;

/**
 * A definition of `MT` as metric tons: `MT: metric tons`, `MT = metric
 * tonnes`, `MT – metric ton`, `MTCO2e: metric tons of CO2e`, `metric tons
 * (MT)` or `MT (metric tons)`. `million metric tons (MT)` is no such
 * definition. The `MT` group is checked in capitals by `definesMtAsMetricTons`.
 */
const MT_DEFINITIONS: RegExp[] = [
  new RegExp(
    String.raw`(?<![\w])(MT)(?:\s*CO(?:2|₂)e?)?\s*[:=–—-]\s*${METRIC_TON}`,
    "gi",
  ),
  new RegExp(String.raw`(?<!million\s+)${METRIC_TON}\s*\(\s*(MT)\s*\)`, "gi"),
  new RegExp(String.raw`(?<![\w])(MT)\s*\(\s*${METRIC_TON}\s*\)`, "gi"),
];

/**
 * True when the document defines MT as metric tons (a glossary line
 * `MT: metric tons`, `MT = metric tonnes`, `MT – metric ton`,
 * `MTCO2e: metric tons of carbon dioxide equivalent`, or `metric tons (MT)`,
 * `MT (metric tons)`). "metric ton(ne)s" matches in any case, `MT` only in
 * capitals: `Mt: million tonnes` and `million metric tons (MT)` are no such
 * definition. Read on the whole document: the glossary often sits on another
 * page than the table.
 */
export function definesMtAsMetricTons(text: string): boolean {
  return MT_DEFINITIONS.some((re) =>
    [...text.matchAll(re)].some((match) => match[1] === "MT"),
  );
}

/**
 * True when the page names a tonne unit (t, tCO2e, tonnes) on a caption line,
 * with the rules of `namesLargeUnit`. "thousand tonnes" and "million tonnes"
 * are large units, not tonnes.
 */
export function namesTonneUnit(text: string): boolean {
  return captionsNameUnit(text, (line) =>
    namesUnit(withoutLargeUnits(line), TONNE_UNIT_PATTERNS),
  );
}

/**
 * True when the page names kg on a caption line, with the rules of
 * `namesLargeUnit`. A per-person kg (`kg/capita`, `kg per person`) does not count.
 */
export function namesSmallUnit(text: string): boolean {
  return captionsNameUnit(text, namesKilogram);
}

/**
 * The scales the page's captions justify: 1000 for kt or Gg (also "thousand
 * tonnes" and "thousand MT", in any case), 1,000,000 for Mt, 0.001 for kg.
 * "thousand Mt CO2e" is kt only. Empty when no caption names a non-tonne unit;
 * the caller passes no scales for text without a page (the chunk path). For a
 * page continuing a table, see `inheritedPageScales`.
 */
export function pageScaleEvidence(text: string): Scale[] {
  const scales: Scale[] = [];
  if (captionsNameUnit(text, (line) => namesUnit(line, KILOTONNE_PATTERNS))) {
    scales.push(1000);
  }
  if (captionsNameUnit(text, namesMegatonne)) {
    scales.push(1000000);
  }
  if (namesSmallUnit(text)) scales.push(0.001);
  return scales;
}

/**
 * True when `text` is one number with a single `.` or `,` followed by exactly
 * three digits (`6.600`, `1,500`, `-2,345 tCO2e`, `(6.600)`). Such a number
 * reads two ways: as a group separator or as a decimal mark. Sign, parentheses,
 * spaces and a trailing unit are ignored.
 */
export function isAmbiguousNumberText(text: string): boolean {
  let t = text.trim().replace(/[ \u00a0\u202f']/g, "");
  t = t.replace(/^\((.*)\)$/, "$1");
  t = t.replace(/^[+\-\u2212]/, "");
  t = t.replace(/(?<=\d)[A-Za-z][A-Za-z0-9\u2082/]*$/, "");
  return /^\d{1,3}[.,]\d{3}$/.test(t);
}

/**
 * True when a caption line of the page names any emissions unit: tonnes, kt,
 * Mt, Gg or kg (a per-person kg does not count). Such a page has unit evidence
 * of its own and inherits none.
 */
function hasOwnUnitCaption(text: string): boolean {
  return classifyCaptionLines(text).some(
    ({ text: line }) =>
      namesUnit(line, LARGE_UNIT_PATTERNS) ||
      namesKilogram(line) ||
      namesUnit(line, TONNE_UNIT_PATTERNS),
  );
}

/** True when a line of the page is a `Table` caption or a Markdown heading. */
function hasTableCaptionOrHeading(text: string): boolean {
  return text.split(/\r?\n/).some((raw) => {
    const line = raw.trim();
    return /^[\s#*_>]*table\b/i.test(line) || line.startsWith("#");
  });
}

/** True when the page's first non-empty line is a table line (it has `|`). */
function startsWithTableLine(text: string): boolean {
  const first = text.split(/\r?\n/).find((line) => line.trim() !== "");
  return first?.includes("|") ?? false;
}

/**
 * Scales each page inherits from a table continued from earlier pages, keyed
 * by page number. Only a continuation page inherits: one whose first non-empty
 * line is a table line, with no `Table` caption, heading or unit caption of
 * its own. It gets what page p-1 passes on: p-1's `pageScaleEvidence` when p-1
 * has a unit caption, or what p-1 inherited when p-1 is a continuation page
 * too. Anything else passes nothing on: a missing page number, a page starting
 * with prose ("Population 5.000" after a kt table), or a page with its own
 * `Table` caption or heading, whether or not it names a unit. A page with its
 * own unit caption (tonnes included) inherits nothing and passes on its own
 * evidence. Pages that inherit nothing get `[]`. Santiago 2022: the
 * `TOTAL (KgCO2e)` header on p20 covers p21 and p22. Pass every page of the
 * document in order, not only the candidate pages, so a continuation page in
 * between is not skipped.
 */
export function inheritedPageScales(
  pages: readonly { page: number; text: string }[],
): Map<number, Scale[]> {
  return inheritedEvidence(pages, pageScaleEvidence, () => []);
}

/**
 * Pages that inherit the `Mt` symbol (`namesMtSymbol`) from a table continued
 * from earlier pages, with the continuation rules of `inheritedPageScales`.
 */
export function inheritedMtSymbol(
  pages: readonly { page: number; text: string }[],
): Map<number, boolean> {
  return inheritedEvidence(pages, namesMtSymbol, () => false);
}

/**
 * Evidence each page inherits from a table continued from earlier pages (see
 * `inheritedPageScales`): `own` of the page with the unit caption, passed on
 * through continuation pages; `none()` for every other page.
 */
function inheritedEvidence<T>(
  pages: readonly { page: number; text: string }[],
  own: (text: string) => T,
  none: () => T,
): Map<number, T> {
  const inherited = new Map<number, T>();
  // Evidence each page passes on to the next: its own, or what it inherited.
  const passedOn = new Map<number, T>();
  for (const { page, text } of pages) {
    if (hasOwnUnitCaption(text)) {
      inherited.set(page, none());
      passedOn.set(page, own(text));
    } else if (hasTableCaptionOrHeading(text) || !startsWithTableLine(text)) {
      inherited.set(page, none());
      passedOn.set(page, none());
    } else {
      const fromPrevious = passedOn.get(page - 1) ?? none();
      inherited.set(page, fromPrevious);
      passedOn.set(page, fromPrevious);
    }
  }
  return inherited;
}
