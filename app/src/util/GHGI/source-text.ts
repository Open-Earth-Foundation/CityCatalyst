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
  const european = countMatches(text, EUROPEAN_PATTERNS);
  const english = countMatches(text, ENGLISH_PATTERNS);
  if (european > english) return "european";
  if (english > european) return "english";
  return "unknown";
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
 * 2. Sign: a leading `-` or `−`, or a value in parentheses, is negative.
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
 * 7. Anything else (letters, several decimal marks, malformed groups): null.
 */
export function parseNumberString(
  s: string,
  style: NumberStyle,
): number | null {
  let t = s.trim().replace(/[ \u00a0\u202f']/g, "");
  let negative = false;
  const paren = /^\((.*)\)$/.exec(t);
  if (paren) {
    negative = true;
    t = paren[1];
  }
  if (t.startsWith("-") || t.startsWith("\u2212")) {
    negative = true;
    t = t.slice(1);
  }
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
 * Every number printed in `text`, parsed with `style`, signs dropped: `(811,512)`
 * and `−603,983` read as 811512 and 603983. `step` is the place value of the last
 * digit (1 for `9,559`, 0.1 for `9,559.2`). A space-grouped run (`9 559 215`)
 * yields the merged number and each token on its own. Tokens that do not parse
 * with the style are skipped.
 */
export function numbersInText(
  text: string,
  style: NumberStyle,
): { value: number; step: number }[] {
  const found: { value: number; step: number }[] = [];
  const add = (token: string) => {
    const value = parseNumberString(token, style);
    if (value == null) return;
    const abs = Math.abs(value);
    found.push({ value: abs, step: lastDigitStep(token, abs) });
  };
  for (const match of text.matchAll(NUMBER_TOKEN)) add(match[0]);
  for (const match of text.matchAll(SPACE_GROUPED)) add(match[0]);
  return found;
}

/** Kilo and mega: the model may convert a kt or Mt figure to tonnes itself. */
const SCALES = [1000, 1000000];

/** A printed figure needs this many significant digits to match scaled. */
const MIN_SCALED_DIGITS = 4;

/** Significant digits of a printed figure: `9,559.2` has 5, `9.56` has 3. */
function significantDigits(value: number, step: number): number {
  const digits = Math.round(value / step);
  return digits === 0 ? 0 : String(digits).length;
}

/**
 * True when `raw` (a model value before unit conversion) is printed in `text`:
 * equal up to rounding of the printed figure, or the printed figure times 1000 or
 * 1,000,000 up to its rounding. The sign is ignored on both sides.
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
): boolean {
  const target = Math.abs(raw);
  return numbersInText(text, style).some(
    ({ value, step }) =>
      Math.abs(target - value) <= Math.max(0.5, step / 2) ||
      (significantDigits(value, step) >= MIN_SCALED_DIGITS &&
        SCALES.some((m) => Math.abs(target - value * m) <= (step * m) / 2)),
  );
}
