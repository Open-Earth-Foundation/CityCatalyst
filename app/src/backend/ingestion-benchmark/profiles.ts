/**
 * Scoring profiles: the matching rules that differ between PDF extraction
 * (lenient, printed-precision sources) and structured-file import (strict).
 */
import type { KeyFile } from "@/backend/ingestion-benchmark/answer-keys";

export type ScoringProfile = {
  name: "pdf" | "structured";
  /** a key ref such as "I.1" matches stored children "I.1.1", "I.1.2" */
  parentRefMatchesChildren: boolean;
  /** a key value of 0 matches a stored row that is absent */
  zeroRowMatchesAbsent: boolean;
  /** rows the key marks "Scored = No" are left out of scoring */
  skipUnscoredRows: boolean;
  /** key rows with the same ref and scope are compared as one sum */
  sumSameRefScope: boolean;
  /** absolute tolerance in tonnes for one key value */
  valueTolerance: (key: KeyFile, keyValue: number) => number;
};

export const PDF_PROFILE: ScoringProfile = {
  name: "pdf",
  parentRefMatchesChildren: true,
  zeroRowMatchesAbsent: true,
  skipUnscoredRows: true,
  sumSameRefScope: true,
  // The sources print whole tonnes; keep half a tonne of slack for the kg to t conversion.
  valueTolerance: (key) => Math.max(key.tolerance, 0.5),
};

export const STRUCTURED_PROFILE: ScoringProfile = {
  name: "structured",
  parentRefMatchesChildren: false,
  zeroRowMatchesAbsent: false,
  skipUnscoredRows: false,
  sumSameRefScope: false,
  valueTolerance: (_key, keyValue) => Math.abs(keyValue) * 0.001,
};
