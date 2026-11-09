/**
 * Metadata a user gives about a source document before extraction: number
 * format, reported total and table pages. Pure module: no server imports.
 */
import { z } from "zod";
import {
  countNumberStyles,
  detectNumberStyle,
  type NumberStyle,
} from "@/util/GHGI/source-text";

export type NumberFormatSource = "user" | "country_default";
export type ReportedTotalKind = "gross" | "net";

export type SourceMetadata = {
  numberFormat: "european" | "english" | null;
  numberFormatSource: NumberFormatSource | null;
  reportedTotal: number | null;
  reportedTotalKind: ReportedTotalKind | null;
  pages: number[] | null;
};

const MAX_PAGES = 2000;

export const sourceMetadataSchema = z
  .object({
    numberFormat: z.enum(["european", "english"]).nullable().default(null),
    numberFormatSource: z
      .enum(["user", "country_default"])
      .nullable()
      .default(null),
    reportedTotal: z.number().positive().finite().nullable().default(null),
    reportedTotalKind: z.enum(["gross", "net"]).nullable().default(null),
    pages: z
      .array(z.number().int().min(1))
      .min(1)
      .max(MAX_PAGES)
      .nullable()
      .default(null),
  })
  .refine(
    (m) => (m.numberFormat === null) === (m.numberFormatSource === null),
    {
      message: "numberFormat and numberFormatSource must be set together",
      path: ["numberFormatSource"],
    },
  )
  .refine(
    (m) => (m.reportedTotal === null) === (m.reportedTotalKind === null),
    {
      message: "reportedTotal and reportedTotalKind must be set together",
      path: ["reportedTotalKind"],
    },
  ) satisfies z.ZodType<SourceMetadata, z.ZodTypeDef, unknown>;

const EUROPEAN_COUNTRIES = new Set(
  "BR AR CL CO PE UY PY BO EC VE DE FR ES IT PT NL BE AT DK SE NO FI PL CZ GR TR ID VN ZA".split(
    " ",
  ),
);
const ENGLISH_COUNTRIES = new Set(
  "US GB IE NZ AU CA MX IN JP CN KR PH SG MY TH IL NG KE GH".split(" "),
);

export function defaultNumberStyleForCountry(
  countryCode: string | null | undefined,
): "european" | "english" | null {
  if (!countryCode) return null;
  const code = countryCode.trim().toUpperCase();
  if (EUROPEAN_COUNTRIES.has(code)) return "european";
  if (ENGLISH_COUNTRIES.has(code)) return "english";
  return null;
}

/**
 * Parses "40-45, 52" into a sorted unique page list. Null for empty input, a
 * reversed range, page 0, a non-digit token or more than 2000 pages.
 */
export function parsePageList(input: string): number[] | null {
  const tokens = input.split(",").map((t) => t.trim());
  if (tokens.length === 0 || tokens.every((t) => t === "")) return null;
  const pages = new Set<number>();
  for (const token of tokens) {
    const m = /^(\d+)(?:\s*-\s*(\d+))?$/.exec(token);
    if (!m) return null;
    const start = Number(m[1]);
    const end = m[2] === undefined ? start : Number(m[2]);
    if (start < 1 || end < start) return null;
    if (end - start + 1 > MAX_PAGES) return null;
    for (let p = start; p <= end; p++) {
      pages.add(p);
      if (pages.size > MAX_PAGES) return null;
    }
  }
  return [...pages].sort((a, b) => a - b);
}

type FormatMetadata = Pick<
  SourceMetadata,
  "numberFormat" | "numberFormatSource"
>;

export function resolveNumberStyle(
  text: string,
  metadata: FormatMetadata | null | undefined,
): NumberStyle {
  if (metadata?.numberFormat && metadata.numberFormatSource === "user") {
    return metadata.numberFormat;
  }
  const detected = detectNumberStyle(text);
  if (
    metadata?.numberFormat &&
    metadata.numberFormatSource === "country_default" &&
    detected === "unknown"
  ) {
    return metadata.numberFormat;
  }
  return detected;
}

/**
 * For a user-chosen format: the text shows at least 3 unambiguous numbers of
 * the other style and none of the chosen one.
 */
export function numberFormatConflict(
  text: string,
  metadata: FormatMetadata | null | undefined,
): { chosen: NumberStyle; detected: NumberStyle } | null {
  if (!metadata?.numberFormat || metadata.numberFormatSource !== "user") {
    return null;
  }
  const chosen = metadata.numberFormat;
  const counts = countNumberStyles(text);
  const opposite = chosen === "european" ? "english" : "european";
  if (counts[opposite] >= 3 && counts[chosen] === 0) {
    return { chosen, detected: opposite };
  }
  return null;
}
