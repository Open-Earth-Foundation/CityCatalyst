/**
 * Removes answer-key content from benchmark output before it goes to git or
 * MLflow. Scoring, gates and the report use the full scores in memory; only
 * the copy that leaves the process is redacted.
 *
 * Answer-key content in a score: the text, ref and value of the key rows that
 * were not matched (`missingRows`), the expected total and the diff against it
 * (the stored total plus `totalDiffPct` gives the expected total back), the
 * distractor text and numbers (`distractorsStored`), and the stored groups
 * that matched no key row (`unexpectedStored`, whose complement marks the
 * stored values that equal a key value). Each list is kept as a count.
 */
import type { FileScore } from "@/backend/ingestion-benchmark/score";

const KEY_CONTENT = [
  "missingRows",
  "expectedTotal",
  "totalDiffPct",
  "distractorsStored",
  "unexpectedStored",
] as const;
type KeyContent = (typeof KEY_CONTENT)[number];

export type PublishedScore = Omit<FileScore, KeyContent> & {
  missingRowCount?: number;
  distractorsStoredCount?: number;
  unexpectedStoredCount?: number;
};

/** Case and run fields of the earlier harness (PR #3317) that held key values. */
const LEGACY_CASE_FIELDS = ["reference"];
const LEGACY_RUN_FIELDS = ["totalDiffPct"];

type Json = Record<string, unknown>;

const count = (list: unknown, earlier: unknown): number | undefined =>
  Array.isArray(list)
    ? list.length
    : typeof earlier === "number"
      ? earlier
      : undefined;

const without = (record: Json, fields: readonly string[]): Json =>
  Object.fromEntries(
    Object.entries(record).filter(([field]) => !fields.includes(field)),
  );

export function redactScore(score: FileScore | PublishedScore): PublishedScore {
  const s = score as Json;
  return {
    ...without(s, KEY_CONTENT),
    missingRowCount: count(s.missingRows, s.missingRowCount),
    distractorsStoredCount: count(
      s.distractorsStored,
      s.distractorsStoredCount,
    ),
    unexpectedStoredCount: count(s.unexpectedStored, s.unexpectedStoredCount),
  } as PublishedScore;
}

/**
 * Copy of a run summary (or a whole results.json, or an older one) with every
 * score redacted. Fields it does not know are kept; the input is not changed.
 */
export function publishableSummary<T extends object>(summary: T): T {
  const source = summary as Json;
  if (!Array.isArray(source.results)) return summary;
  return {
    ...source,
    results: (source.results as Json[]).map((result) => ({
      ...without(result, LEGACY_CASE_FIELDS),
      ...(Array.isArray(result.runs)
        ? {
            runs: (result.runs as Json[]).map((run) => {
              const rest = without(run, LEGACY_RUN_FIELDS);
              return run.score
                ? { ...rest, score: redactScore(run.score as FileScore) }
                : rest;
            }),
          }
        : {}),
    })),
  } as T;
}
