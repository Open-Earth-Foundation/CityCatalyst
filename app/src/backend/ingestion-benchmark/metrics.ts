/**
 * Pass rules and per-case / per-block metrics of the PDF extraction benchmark
 * (spec 5.3). A case passes only when all three attempts pass.
 */
import type { KeyFile } from "@/backend/ingestion-benchmark/answer-keys";
import {
  caseMetrics,
  caseUsage,
  costUsd,
  type Block,
  type CaseResult,
  type FailureMode,
  type Prices,
  type RunEntry,
} from "@/backend/ingestion-benchmark/report";

/** An attempt whose stored total is this many times off the key is a guardrail failure. */
export const GUARDRAIL_FACTOR = 10;

/** Attempts a non-exploratory case must have. */
const REQUIRED_ATTEMPTS = 3;

const FAILURE_MODES: FailureMode[] = [
  "scored",
  "ocr_error",
  "extraction_error",
  "truncated",
  "zero_rows",
  "approve_error",
  "readback_error",
  "setup_error",
];

const BLOCK_ORDER: Block[] = ["validated", "held-out", "dev"];

/** Ratio between two totals, symmetric and on absolute values. */
export function offByFactor(stored: number, expected: number): number {
  const s = Math.abs(stored);
  const e = Math.abs(expected);
  if (s === 0 && e === 0) return 1;
  if (s === 0 || e === 0) return Infinity;
  return Math.max(s / e, e / s);
}

/** True when the attempt has an expected total and its stored total is 10x or more off. */
function isTenX(entry: RunEntry): boolean {
  const score = entry.score;
  if (!score || score.expectedTotal == null) return false;
  return (
    offByFactor(score.storedTotal, score.expectedTotal) >= GUARDRAIL_FACTOR
  );
}

export function attemptPasses(entry: RunEntry, _key: KeyFile): boolean {
  return (
    entry.failureMode === "scored" &&
    entry.score?.totalWithinTolerance === true &&
    !isTenX(entry)
  );
}

export type CaseVerdict = {
  id: string;
  block: Block;
  eligible: boolean | null;
  attempts: number;
  attemptsPassed: number;
  casePasses: boolean;
  exploratory: boolean;
  recallFailedAsZero: number | null;
  recallScoredOnly: number | null;
  /** Spec 5.4, means over the scored attempts. */
  rowPrecision: number | null;
  valueAccuracy: number | null;
  classificationAccuracy: number | null;
  /** Notation keys of the first scored attempt. */
  notationScored: number;
  notationRecovered: number;
  /** Distractor values stored, mean per scored attempt. */
  distractorsStored: number | null;
  totalWithinToleranceAll: boolean | null;
  tenXAttempts: number;
  wrongTotalAttempts: number;
  warnedWrongTotalAttempts: number;
  failureModes: Record<FailureMode, number>;
  costUsd: number | null;
  seconds: number;
};

const mean = (values: number[]): number | null =>
  values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;

export function caseVerdict(
  result: CaseResult,
  key: KeyFile,
  prices?: Prices,
): CaseVerdict {
  const runs = result.runs;
  const scored = runs.filter((run) => run.failureMode === "scored");
  const attemptsPassed = runs.filter((run) => attemptPasses(run, key)).length;
  const hasRows = !result.totalOnly && (key.keyValueRows ?? 0) > 0;
  const recallOf = (run: RunEntry) =>
    run.failureMode === "scored" ? (run.score?.rowRecall ?? 0) : 0;
  const withTotal = runs.filter((run) => run.score?.expectedTotal != null);
  const wrongTotal = scored.filter(
    (run) => run.score?.totalWithinTolerance === false,
  );
  const failureModes = Object.fromEntries(
    FAILURE_MODES.map((mode) => [
      mode,
      runs.filter((run) => run.failureMode === mode).length,
    ]),
  ) as Record<FailureMode, number>;
  const metrics = caseMetrics(result);

  return {
    id: result.id,
    block: result.block,
    eligible: result.eligible,
    attempts: runs.length,
    attemptsPassed,
    casePasses:
      runs.length === REQUIRED_ATTEMPTS && attemptsPassed === REQUIRED_ATTEMPTS,
    exploratory: runs.length !== REQUIRED_ATTEMPTS,
    recallFailedAsZero: hasRows ? mean(runs.map(recallOf)) : null,
    recallScoredOnly: hasRows
      ? mean(
          scored.flatMap((run) =>
            typeof run.score?.rowRecall === "number"
              ? [run.score.rowRecall]
              : [],
          ),
        )
      : null,
    rowPrecision: metrics.rowPrecision,
    valueAccuracy: metrics.valueAccuracy,
    classificationAccuracy: metrics.classificationAccuracy,
    notationScored: metrics.notationScored,
    notationRecovered: metrics.notationRecovered,
    distractorsStored: metrics.distractorsStored,
    totalWithinToleranceAll:
      withTotal.length === 0
        ? null
        : runs.every(
            (run) =>
              run.failureMode === "scored" &&
              run.score?.totalWithinTolerance === true,
          ),
    tenXAttempts: runs.filter(isTenX).length,
    wrongTotalAttempts: wrongTotal.length,
    warnedWrongTotalAttempts: wrongTotal.filter(
      (run) => run.warnings.length > 0,
    ).length,
    failureModes,
    costUsd: costUsd(caseUsage(result), prices),
    seconds: runs.reduce((sum, run) => sum + run.stageMs.total, 0) / 1000,
  };
}

export type BlockSummary = {
  block: Block;
  casesInRun: number;
  casesInManifest: number;
  headlineRecall: number | null;
  /** Eligible cases with a recall that went into the headline (total-only cases have none). */
  headlineRecallCases: number;
  recallScoredOnly: number | null;
  /** Eligible cases with a scored-attempt recall that went into the figure above. */
  recallScoredOnlyCases: number;
  casesTotalWithinTolerance: number;
  attemptPassShare: number | null;
  tenXAttempts: number;
  warningShare: number | null;
};

const meanOf = (values: (number | null)[]): number | null =>
  mean(values.filter((v): v is number => v !== null));

const countOf = (values: (number | null)[]): number =>
  values.filter((v) => v !== null).length;

export function blockSummaries(
  verdicts: CaseVerdict[],
  manifestCounts: Record<Block, number>,
): BlockSummary[] {
  return BLOCK_ORDER.flatMap((block) => {
    const cases = verdicts.filter((v) => v.block === block);
    if (cases.length === 0) return [];
    const eligible = cases.filter((v) => v.eligible === true);
    const attempts = cases.reduce((sum, v) => sum + v.attempts, 0);
    const wrong = cases.reduce((sum, v) => sum + v.wrongTotalAttempts, 0);
    const warned = cases.reduce(
      (sum, v) => sum + v.warnedWrongTotalAttempts,
      0,
    );
    return [
      {
        block,
        casesInRun: cases.length,
        casesInManifest: manifestCounts[block],
        headlineRecall: meanOf(eligible.map((v) => v.recallFailedAsZero)),
        headlineRecallCases: countOf(eligible.map((v) => v.recallFailedAsZero)),
        recallScoredOnly: meanOf(eligible.map((v) => v.recallScoredOnly)),
        recallScoredOnlyCases: countOf(eligible.map((v) => v.recallScoredOnly)),
        casesTotalWithinTolerance: cases.filter(
          (v) => v.totalWithinToleranceAll === true,
        ).length,
        attemptPassShare:
          attempts === 0
            ? null
            : cases.reduce((sum, v) => sum + v.attemptsPassed, 0) / attempts,
        tenXAttempts: cases.reduce((sum, v) => sum + v.tenXAttempts, 0),
        warningShare: wrong === 0 ? null : warned / wrong,
      },
    ];
  });
}
