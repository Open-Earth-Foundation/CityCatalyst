/**
 * Offline adapter for the unmodified CityCatalyst PDF scorer cached in .local.
 * Invoked by examples.compare_benchmarks with input/output JSON filenames.
 * No requests, model calls, database writes, or agent feedback are performed.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { scoreFile, isGpcExcluded, SCORER_VERSION } from "./.local/upstream/app/src/backend/ingestion-benchmark/score";
import { toCanonical } from "./.local/upstream/app/src/util/notation-keys";
import { totalTolerance } from "./.local/upstream/app/src/backend/ingestion-benchmark/tolerance";

/** Keep unknown numeric rows in the scorer instead of inflating precision by dropping them. */
export function adapt(envelope: any) {
  const data = envelope?.result?.data || {};
  const rows = Array.isArray(data.rows) ? data.rows : [];
  const stored = [];
  const warnings: string[] = [];
  for (const [index, row] of rows.entries()) {
    if (!row || typeof row !== "object") {
      warnings.push(`Row ${index}: invalid row omitted.`);
      continue;
    }
    const numeric = typeof row.emissions_tco2e === "number" && Number.isFinite(row.emissions_tco2e);
    const notation = toCanonical(row.notation_key);
    if (!numeric && !notation) {
      warnings.push(`Row ${index}: no accepted number or supported notation; not counted as a stored value.`);
      continue;
    }
    const gpc = typeof row.gpc_ref === "string" && row.gpc_ref ? row.gpc_ref : `UNMAPPED-${index}`;
    if (gpc.startsWith("UNMAPPED-")) warnings.push(`Row ${index}: GPC mapping unavailable; numeric value retained in totals/precision.`);
    if (numeric && notation) warnings.push(`Row ${index}: both number and notation supplied; number retained for scoring.`);
    stored.push({ gpc, scope: row.scope == null ? null : String(row.scope), valueT: numeric ? row.emissions_tco2e : 0, omit: isGpcExcluded(gpc) || row.total_inclusion === "excluded", notation: numeric ? null : notation });
  }
  return { stored, warnings, reportedTotal: data.reported_total_tco2e ?? null, invalidArtifact: !envelope?.result };
}

/** Mark an unsplit I/II/III subsector using the scorer's nonnumeric wildcard syntax.
 * No scope or child reference is invented; an exact scoped key still cannot match it.
 * Apply to both pipelines at the StoredValue boundary, independent of answer values.
 */
export function scoringReference(ref: string): string {
  return /^(?:I|II|III)\.\d+$/.test(ref) ? `${ref}.x` : ref;
}

/** Use exactly the current upstream PDF profile on both datasets. */
function evaluate(key: any, stored: any[], ok = true) {
  const score = scoreFile(key, stored.map((row) => ({ ...row, gpc: scoringReference(row.gpc) })));
  return { ...score, totalMatched: ok && score.totalWithinTolerance === true };
}

/** Score saved outputs and all matching recorded attempts with identical rules/keys. */
function main() {
  const [input, output] = process.argv.slice(2);
  if (!input || !output) throw new Error("Invoke through python -m examples.compare_benchmarks");
  const payload = JSON.parse(readFileSync(input, "utf8"));
  const compared = payload.demo.map((attempt: any) => {
    const key = { ...payload.keys[attempt.canonicalId], nonGpc: !!attempt.totalOnly, distractors: payload.keys[attempt.canonicalId].distractors || [] };
    const converted = adapt(attempt.envelope);
    const score = converted.invalidArtifact ? null : evaluate(key, converted.stored);
    const baseline = payload.baseline.results.find((item: any) => item.id === attempt.canonicalId);
    const tolerance = totalTolerance(key);
    const slack = tolerance.source === "rule" ? tolerance.tonnes : Math.max(tolerance.tonnes, 0.5);
    const uncertainty = (attempt.envelope?.result?.data?.rows || []).filter((row: any) => row.total_inclusion === "unclear").length;
    return {
      ...attempt, envelope: undefined,
      usage: attempt.envelope?.usage ?? null,
      pipelineAccepted: !converted.invalidArtifact && attempt.envelope?.validation?.data_schema !== "failed" && !["failed", "cancelled", "needs_input", "repair_error"].includes(attempt.envelope?.execution_status),
      adapted: converted,
      score,
      baseline: baseline ? baseline.runs.map((run: any) => ({ attempt: run.run, ok: run.ok, failureMode: run.failureMode, recordedScore: run.score ?? null, rescored: evaluate(key, run.stored || [], run.ok !== false) })) : [],
      reportedTotalMatched: typeof converted.reportedTotal === "number" && key.expectedTotal != null ? Math.abs(converted.reportedTotal - key.expectedTotal) <= slack : null,
      unclearTotalInclusionRows: uncertainty,
      strictTotalPassed: !!score?.totalMatched && uncertainty === 0 && attempt.envelope?.execution_status !== "repair_error",
      unresolvedMappings: (attempt.envelope?.result?.data?.rows || []).filter((row: any) => row.gpc_ref == null || row.scope_basis === "unknown" || row.scope_basis === "combined").length,
      ambiguousFields: (attempt.envelope?.result?.fields || []).filter((field: any) => field.status === "ambiguous").length,
    };
  });
  writeFileSync(output, JSON.stringify({ scorerVersion: SCORER_VERSION, referenceAdapterVersion: "2-parent-wildcard", comparisons: compared }, null, 2), "utf8");
}

main();
