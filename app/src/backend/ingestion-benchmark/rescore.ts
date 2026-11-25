/**
 * Rescores stored benchmark runs with the current scorer and answer keys, with
 * no LLM or OCR call. Use it when the scorer or the keys change, so old and new
 * runs are compared under the same rules.
 */
import type { KeyFile } from "@/backend/ingestion-benchmark/answer-keys";
import type { CaseResult } from "@/backend/ingestion-benchmark/report";
import { scoreWithVariant } from "@/backend/ingestion-benchmark/scoring-variant";

/** Same rule as the benchmark: all finished runs store the same rounded total. */
export function stableTotal(result: CaseResult): boolean {
  const totals = result.runs
    .filter((entry) => entry.ok)
    .map((entry) => Math.round(entry.total ?? 0));
  return totals.length > 1 && new Set(totals).size === 1;
}

/** Total-only cases are scored on the total: the scorer reads that from `nonGpc`. */
export function scoringKey(key: KeyFile, totalOnly: boolean): KeyFile {
  return totalOnly ? { ...key, nonGpc: true } : key;
}

/**
 * Recomputes every score from the stored values and `key`, and for a
 * precomputed pipeline the parent-reference variant from the stored values
 * plus the dropped parent-reference rows. Scores read from a results.json are
 * redacted (no expected values), so they are always replaced, truncated
 * attempts included.
 */
export function rescoreCase(result: CaseResult, key: KeyFile): CaseResult {
  const runs = result.runs.map((entry) => {
    if (!(entry.stored && (entry.ok || entry.score))) return entry;
    const scores = scoreWithVariant(
      scoringKey(key, result.totalOnly),
      entry.stored,
      entry.pipeline?.parentRefRows,
    );
    return {
      ...entry,
      score: scores.standard,
      ...(entry.pipeline
        ? { pipeline: { ...entry.pipeline, variantScore: scores.parentRefs } }
        : {}),
    };
  });
  const rescored = { ...result, keyId: key.id, runs };
  return { ...rescored, stableTotal: stableTotal(rescored) };
}
