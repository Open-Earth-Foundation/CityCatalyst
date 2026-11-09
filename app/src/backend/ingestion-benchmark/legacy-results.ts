/**
 * Reads a `results.json` written by the earlier harness (PR #3317) so it can be
 * rescored with the current scorer. The old files lack the failure mode, stage
 * times, warnings and the block/eligibility fields; this fills them in.
 */
import type {
  Block,
  CaseResult,
  FailureMode,
  RunEntry,
  RunSummary,
} from "@/backend/ingestion-benchmark/report";
import type { CaseManifestEntry } from "@/backend/ingestion-benchmark/selection";

type LegacyRun = Partial<RunEntry> & { run: number; ok: boolean; ms: number };
type LegacyCase = Partial<CaseResult> & {
  id: string;
  runs: LegacyRun[];
};
export type LegacySummary = Partial<RunSummary> & {
  measuredAt: string;
  commit: string;
  results: LegacyCase[];
};

export function adaptLegacyRun(run: LegacyRun): RunEntry {
  const failureMode: FailureMode =
    run.failureMode ?? (run.score ? "scored" : "extraction_error");
  return {
    ...run,
    failureMode,
    zeroRowsReason: run.zeroRowsReason ?? undefined,
    warnings: run.warnings ?? [],
    stageMs: run.stageMs ?? {
      ocr: null,
      extraction: null,
      import: null,
      total: run.ms,
    },
  };
}

export function adaptLegacyCase(
  result: LegacyCase,
  manifest: CaseManifestEntry[],
  heldOut: string[] = [],
): CaseResult {
  const entry = manifest.find(
    (item) => item.id.toLowerCase() === result.id.toLowerCase(),
  );
  const block: Block =
    result.block ??
    entry?.block ??
    (heldOut.includes(result.id) ? "held-out" : "validated");
  const totalOnly = result.totalOnly ?? entry?.totalOnly ?? false;
  return {
    ...result,
    file: result.file ?? entry?.fileName ?? "",
    kind: result.kind ?? "pdf",
    targetYear: result.targetYear ?? entry?.year ?? 0,
    keyId: result.keyId ?? null,
    ocr: result.ocr ?? null,
    productFlowFailsAtOcr: result.productFlowFailsAtOcr ?? false,
    stableTotal: result.stableTotal ?? false,
    block,
    totalOnly,
    eligible:
      result.eligible !== undefined
        ? result.eligible
        : entry
          ? entry.totalOnly
            ? null
            : entry.textTables === true
          : null,
    runs: result.runs.map(adaptLegacyRun),
  };
}

export function adaptLegacySummary(
  raw: LegacySummary,
  manifest: CaseManifestEntry[],
): CaseResult[] {
  return raw.results.map((result) =>
    adaptLegacyCase(result, manifest, raw.heldOut),
  );
}
