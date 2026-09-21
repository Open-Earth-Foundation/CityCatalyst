/**
 * Shared GPC notation-key encoding for CityCatalyst.
 *
 * CityCatalyst historically stored `unavailableReason` in three spellings:
 * - GPC short codes: NO | NE | C | IE
 * - Canonical kebab (DB/API): no-occurrance | not-estimated | …
 * - Legacy activity/auto-connect: reason-NO | reason-NE | …
 *
 * Writers should persist kebab via `toCanonical`. Exporters emit short codes via
 * `toShort`. Readers dual-accept all three forms through these helpers.
 *
 * Note: `no-occurrance` keeps the existing typo for backwards compatibility.
 */

export const NOTATION_KEY_CANONICAL = [
  "no-occurrance",
  "not-estimated",
  "confidential-information",
  "included-elsewhere",
] as const;

export type NotationKeyCanonical = (typeof NOTATION_KEY_CANONICAL)[number];

export const NOTATION_KEY_SHORT = ["NO", "NE", "C", "IE"] as const;

export type NotationKeyShort = (typeof NOTATION_KEY_SHORT)[number];

const SHORT_TO_CANONICAL: Record<NotationKeyShort, NotationKeyCanonical> = {
  NO: "no-occurrance",
  NE: "not-estimated",
  C: "confidential-information",
  IE: "included-elsewhere",
};

const CANONICAL_TO_SHORT: Record<NotationKeyCanonical, NotationKeyShort> = {
  "no-occurrance": "NO",
  "not-estimated": "NE",
  "confidential-information": "C",
  "included-elsewhere": "IE",
};

const LEGACY_REASON_TO_CANONICAL: Record<string, NotationKeyCanonical> = {
  "reason-NO": "no-occurrance",
  "reason-NE": "not-estimated",
  "reason-C": "confidential-information",
  "reason-IE": "included-elsewhere",
};

/** Normalize any known spelling to the canonical kebab DB/API form. */
export function toCanonical(
  input?: string | null,
): NotationKeyCanonical | null {
  if (!input) return null;
  const trimmed = input.trim();
  if (!trimmed) return null;

  const upper = trimmed.toUpperCase();
  if (upper in SHORT_TO_CANONICAL) {
    return SHORT_TO_CANONICAL[upper as NotationKeyShort];
  }

  const lower = trimmed.toLowerCase();
  if ((NOTATION_KEY_CANONICAL as readonly string[]).includes(lower)) {
    return lower as NotationKeyCanonical;
  }

  // Legacy reason-* (case-insensitive)
  const reasonMatch = Object.entries(LEGACY_REASON_TO_CANONICAL).find(
    ([key]) => key.toLowerCase() === lower,
  );
  if (reasonMatch) {
    return reasonMatch[1];
  }

  return null;
}

/** Convert any known spelling to the GPC short code for exports. */
export function toShort(input?: string | null): NotationKeyShort | null {
  const canonical = toCanonical(input);
  return canonical ? CANONICAL_TO_SHORT[canonical] : null;
}

export function isNotationKey(input?: string | null): boolean {
  return toCanonical(input) != null;
}

export function isNotEstimated(input?: string | null): boolean {
  return toCanonical(input) === "not-estimated";
}

export function isNotOccurring(input?: string | null): boolean {
  return toCanonical(input) === "no-occurrance";
}

/**
 * i18n key for activity/manage-sectors copy. Prefers canonical kebab keys that
 * exist in locale files; falls back to the original string when unknown.
 */
export function toI18nReasonKey(input?: string | null): string | null {
  return toCanonical(input) ?? (input ? input : null);
}

/** Badge / label keys like notation-key-NE used in the activity tab. */
export function toNotationKeyLabelKey(
  input?: string | null,
): `notation-key-${NotationKeyShort}` {
  const short = toShort(input) ?? "NO";
  return `notation-key-${short}`;
}
