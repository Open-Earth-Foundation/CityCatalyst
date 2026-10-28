/**
 * Closed authority-scope provenance contract shared by storage and the PDF.
 *
 * The two codes are the only reader-facing status. Wording is chosen here so a
 * chapter that omits every provenance sentence cannot hide the status.
 */

export const AUTHORITY_SCOPE_CLASSIFICATION_METHODS = [
  "ai_classified",
  "human_classified",
] as const;

export const AUTHORITY_SCOPE_REVIEW_STATUSES = [
  "pending_human_review",
  "human_accepted",
  "human_rejected",
] as const;

export type AuthorityScopeClassificationMethod =
  (typeof AUTHORITY_SCOPE_CLASSIFICATION_METHODS)[number];
export type AuthorityScopeReviewStatus =
  (typeof AUTHORITY_SCOPE_REVIEW_STATUSES)[number];

export interface AuthorityScopeClassification {
  classification_method: AuthorityScopeClassificationMethod;
  review_status: AuthorityScopeReviewStatus;
  authority_scope: string;
  authority_scope_status: string;
}

const VALID_PAIRS = new Set([
  "ai_classified|pending_human_review",
  "ai_classified|human_accepted",
  "ai_classified|human_rejected",
  "human_classified|human_accepted",
]);

const STATUS_TEXT: Record<"en" | "es", Record<string, string>> = {
  en: {
    "ai_classified|pending_human_review":
      "AI-unreviewed. An AI model classified this authority scope and no person has accepted it. The wording stays conservative.",
    "ai_classified|human_accepted":
      "AI-approved. A person accepted the AI classification of this authority scope.",
    "human_classified|human_accepted":
      "Human-classified. A person classified this authority scope directly from the legal source.",
    "ai_classified|human_rejected":
      "AI-rejected. A person rejected the AI classification. This scope is not validated.",
  },
  es: {
    "ai_classified|pending_human_review":
      "IA-sin-revisar. Un modelo de IA clasificó este alcance de competencia y ninguna persona lo ha aceptado. La redacción se mantiene conservadora.",
    "ai_classified|human_accepted":
      "IA-aprobada. Una persona aceptó la clasificación de IA de este alcance de competencia.",
    "human_classified|human_accepted":
      "Clasificación-humana. Una persona clasificó este alcance de competencia directamente desde la fuente legal.",
    "ai_classified|human_rejected":
      "IA-rechazada. Una persona rechazó la clasificación de IA. Este alcance no está validado.",
  },
};

function pairKey(
  method: string,
  review: string,
): string {
  return `${method}|${review}`;
}

export function readAuthorityScopeClassification(
  value: unknown,
): AuthorityScopeClassification | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const method = record.classification_method;
  const review = record.review_status;
  const scope = record.authority_scope;
  const status = record.authority_scope_status;
  if (
    typeof method !== "string" ||
    typeof review !== "string" ||
    typeof scope !== "string" ||
    typeof status !== "string" ||
    !scope ||
    !status ||
    !VALID_PAIRS.has(pairKey(method, review))
  ) {
    return null;
  }
  return {
    classification_method: method as AuthorityScopeClassificationMethod,
    review_status: review as AuthorityScopeReviewStatus,
    authority_scope: scope,
    authority_scope_status: status,
  };
}

export function authorityScopeStatusText(
  classification: AuthorityScopeClassification | null | undefined,
  language: string,
): string | null {
  if (!classification) return null;
  const key = pairKey(
    classification.classification_method,
    classification.review_status,
  );
  const locale = language === "es" ? STATUS_TEXT.es : STATUS_TEXT.en;
  return locale[key] ?? null;
}
