/**
 * Metadata a user gives about a source document before extraction: number
 * format and reported total. Pure module: no server imports.
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
};

export const sourceMetadataSchema = z
  .object({
    numberFormat: z.enum(["european", "english"]).nullable().default(null),
    numberFormatSource: z
      .enum(["user", "country_default"])
      .nullable()
      .default(null),
    reportedTotal: z.number().finite().nullable().default(null),
    reportedTotalKind: z.enum(["gross", "net"]).nullable().default(null),
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
  )
  // Gross is positive; a net total may be negative (removals exceed emissions).
  .refine(
    (m) =>
      m.reportedTotal === null ||
      (m.reportedTotalKind === "net"
        ? m.reportedTotal !== 0
        : m.reportedTotal > 0),
    {
      message: "a gross total must be positive and a net total non-zero",
      path: ["reportedTotal"],
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
