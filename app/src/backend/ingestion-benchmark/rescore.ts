/**
 * Rescores stored benchmark runs with the current scorer and answer keys, with
 * no LLM or OCR call. Use it when the scorer or the keys change, so old and new
 * runs are compared under the same rules.
 */
import type { KeyFile } from "@/backend/ingestion-benchmark/answer-keys";
import type { CaseResult } from "@/backend/ingestion-benchmark/report";
import { scoreFile } from "@/backend/ingestion-benchmark/score";

/** Same rule as the benchmark: all finished runs store the same rounded total. */
export function stableTotal(result: CaseResult): boolean {
  const totals = result.runs
    .filter((entry) => entry.ok)
    .map((entry) => Math.round(entry.total ?? 0));
  return totals.length > 1 && new Set(totals).size === 1;
}

export function rescoreCase(result: CaseResult, key: KeyFile): CaseResult {
  const runs = result.runs.map((entry) =>
    entry.ok && entry.stored
      ? { ...entry, score: scoreFile(key, entry.stored) }
      : entry,
  );
  const rescored = { ...result, keyId: key.id, runs };
  return { ...rescored, stableTotal: stableTotal(rescored) };
}
