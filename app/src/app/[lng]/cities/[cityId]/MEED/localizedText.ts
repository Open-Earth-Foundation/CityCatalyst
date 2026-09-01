import type { MeedLocalizedText } from "@/util/types/meed";

/** Language used when the requested one is absent. */
const FALLBACK_LANGUAGE = "en";

/**
 * Pick one language out of a translated field.
 *
 * The service returns these as maps, so the choice belongs at the point of
 * display rather than in the adapter: the same stored ranking is read by a
 * Spanish and an English user, and only the screen knows which is which.
 *
 * Falls back to English, then to any language the map does carry — a legal
 * justification in the wrong language is far more use than a blank space.
 */
export function resolveLocalizedText(
  value: MeedLocalizedText | null | undefined,
  language: string,
): string | null {
  if (!value) return null;
  const candidates = [language, FALLBACK_LANGUAGE, ...Object.keys(value)];
  for (const key of candidates) {
    const text = value[key];
    if (typeof text === "string" && text.trim().length > 0) return text;
  }
  return null;
}
