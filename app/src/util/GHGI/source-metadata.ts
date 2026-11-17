/**
 * Number format the server assumes for a source document when the document's own
 * style is undetected: the default of the city's country. Pure module: no
 * server imports.
 */
import { z } from "zod";
import {
  detectNumberStyle,
  type NumberStyle,
} from "@/util/GHGI/source-text";

export type NumberFormatSource = "country_default";

export type SourceMetadata = {
  numberFormat: "european" | "english";
  numberFormatSource: NumberFormatSource;
};

export const sourceMetadataSchema = z.object({
  numberFormat: z.enum(["european", "english"]),
  numberFormatSource: z.literal("country_default"),
}) satisfies z.ZodType<SourceMetadata, z.ZodTypeDef, unknown>;

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

/** The document's own style wins; the country default settles an undetected one. */
export function resolveNumberStyle(
  text: string,
  metadata: SourceMetadata | null | undefined,
): NumberStyle {
  const detected = detectNumberStyle(text);
  if (metadata?.numberFormat && detected === "unknown") {
    return metadata.numberFormat;
  }
  return detected;
}
