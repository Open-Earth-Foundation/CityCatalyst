/**
 * Privacy-policy version stamped onto every consent record.
 * Bump this when the public privacy policy changes materially, so the ledger
 * shows which text the person agreed to.
 */
export const PRIVACY_POLICY_VERSION = "2026-09-28";

export const CONSENT_TYPES = ["analytics", "marketing"] as const;
export type ConsentType = (typeof CONSENT_TYPES)[number];

export const CONSENT_STATUSES = ["granted", "withdrawn"] as const;
export type ConsentStatus = (typeof CONSENT_STATUSES)[number];

export const CONSENT_SOURCES = [
  "cookie_banner",
  "account_settings",
  "api",
] as const;
export type ConsentSource = (typeof CONSENT_SOURCES)[number];

/** Placeholder written into DSAR exports in place of a stored secret. */
export const REDACTED = "[redacted]";

/** Cap per table so one export cannot load an unbounded result set. */
export const DSAR_ROW_LIMIT = 5000;
