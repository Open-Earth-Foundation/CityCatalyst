import type {
  MeedI18nList,
  MeedI18nText,
  MeedLocalizedText,
} from "@/util/types/meed";

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

/**
 * The report contract is looser than the ranking's: localized fields may be a
 * `{ en, es }` map or a bare string, because older responses returned flat
 * text. Both are accepted rather than trusting one and breaking on the other.
 */
export function resolveI18nText(
  value: MeedI18nText | null | undefined,
  language: string,
): string | null {
  if (value == null) return null;
  if (typeof value === "string") return value.trim() ? value : null;
  return resolveLocalizedText(value, language);
}

/** The list equivalent — chapter limitations arrive keyed by language. */
export function resolveI18nList(
  value: MeedI18nList | null | undefined,
  language: string,
): string[] {
  if (value == null) return [];
  if (Array.isArray(value)) return value;
  const candidates = [language, FALLBACK_LANGUAGE, ...Object.keys(value)];
  for (const key of candidates) {
    const list = value[key];
    if (Array.isArray(list) && list.length > 0) return list;
  }
  return [];
}
