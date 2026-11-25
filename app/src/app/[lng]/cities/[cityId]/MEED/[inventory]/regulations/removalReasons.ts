import type { TFunction } from "i18next";

/**
 * The prioritizer's removal reason, in words. The codes are the method's
 * `discard_reason` values; anything unknown is still shown, humanised, so a
 * new code never renders as `snake_case` in the UI.
 */
const REASON_KEYS: Record<string, string> = {
  legal_verdict_blocked: "reason-legal-verdict-blocked",
  blocked: "reason-legal-verdict-blocked",
  user_excluded: "reason-user-excluded",
  discarded_excluded: "reason-user-excluded",
  score_missing: "reason-score-missing",
  action_score_missing: "reason-score-missing",
  verdict_score_missing: "reason-score-missing",
  financial_feasibility_score_missing: "reason-score-missing",
  mitigation_feasibility_score_missing: "reason-score-missing",
  assessment_missing: "reason-assessment-missing",
  legal_assessment_missing: "reason-assessment-missing",
};

export function removalReasonText(code: string, t: TFunction): string {
  const key = REASON_KEYS[code.trim().toLowerCase()];
  return key
    ? t(key)
    : t("reason-other", { code: code.replace(/_/g, " ").toLowerCase() });
}
