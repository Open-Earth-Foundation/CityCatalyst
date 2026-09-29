/**
 * Parse a spreadsheet / CSV cell into a finite number.
 *
 * `Number("−239.5")` is NaN (unicode minus). Chilean eCRF exports also use
 * accounting parentheses, thousands separators, and comma decimals. The eCRF
 * importer must keep signed values so AFOLU removals are not dropped.
 *
 * `0` is returned as 0 (callers treat it as empty / notation-key, not a removal).
 */
export function parseNumericCell(value: unknown): number | undefined {
  if (value === null || value === undefined || value === "") {
    return undefined;
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : undefined;
  }
  if (typeof value === "bigint") {
    return Number(value);
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    if ("result" in record) {
      return parseNumericCell(record.result);
    }
    return undefined;
  }
  if (typeof value !== "string") {
    return undefined;
  }

  let text = value.trim();
  if (!text) {
    return undefined;
  }

  let sign = 1;
  if (/^\(.*\)$/.test(text)) {
    sign = -1;
    text = text.slice(1, -1).trim();
  }

  // ASCII hyphen, unicode minus, en-dash, em-dash
  if (/^[\u2212\u2013\u2014-]/.test(text)) {
    sign = -1;
    text = text.replace(/^[\u2212\u2013\u2014-]+/, "");
  }

  text = text.replace(/[\s\u00A0'’]/g, "");
  if (!text) {
    return undefined;
  }

  const normalized = normalizeDecimalAndThousands(text);
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) {
    return undefined;
  }
  return sign * parsed;
}

/** True when the cell is a non-zero finite emission / activity amount (negatives count). */
export function hasSignedNumericValue(
  value: number | undefined,
): value is number {
  return value != null && Number.isFinite(value) && value !== 0;
}

/**
 * Last `,` or `.` followed by 1–2 digits is the decimal separator.
 * `1.234,56` (EU) vs `1,234.56` (US). Groups of three with no other decimal
 * are thousands (`1.234` → 1234, `1,234` → 1234).
 */
function normalizeDecimalAndThousands(text: string): string {
  const lastComma = text.lastIndexOf(",");
  const lastDot = text.lastIndexOf(".");

  if (lastComma === -1 && lastDot === -1) {
    return text;
  }

  if (lastComma !== -1 && lastDot !== -1) {
    if (lastComma > lastDot) {
      return text.replace(/\./g, "").replace(",", ".");
    }
    return text.replace(/,/g, "");
  }

  if (lastComma !== -1) {
    if (/^\d{1,3}(,\d{3})+$/.test(text)) {
      return text.replace(/,/g, "");
    }
    return text.replace(/,/g, ".");
  }

  if (/^\d{1,3}(\.\d{3})+$/.test(text)) {
    return text.replace(/\./g, "");
  }
  return text;
}
