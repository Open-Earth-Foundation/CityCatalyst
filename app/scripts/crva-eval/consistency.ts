/**
 * Compares the scored runs of one city.
 *
 *   npx tsx scripts/crva-eval/consistency.ts --dir <reports/crva-eval/<city>/<timestamp>>
 *
 * Reads run-<n>.json and score-run-<n>/scored.json; writes consistency.md.
 * Failed or unscored runs are skipped and listed.
 */
import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type { RunStats } from "./run-adapter";
import type { ScoredRow } from "./types";

export interface ConsistencyRun {
  stats: RunStats;
  rows: ScoredRow[];
}
export interface ConsistencyInput {
  runs: ConsistencyRun[];
}
type MinMaxKey = "valuesKept" | "valuesDropped" | "minutes";

export function consistency(input: ConsistencyInput): {
  minMax: Record<MinMaxKey, { min: number; max: number }>;
  sameStatusShare: number;
  perField: Record<string, number>;
} {
  const { runs } = input;
  const minMax = {} as Record<MinMaxKey, { min: number; max: number }>;
  for (const key of ["valuesKept", "valuesDropped", "minutes"] as const) {
    const values = runs.map((r) => r.stats[key]);
    minMax[key] = { min: Math.min(...values), max: Math.max(...values) };
  }

  // Gold rows of v0 fields that have an answer, keyed by sheet row.
  const statuses = new Map<number, { fieldId: string; seen: Set<string> }>();
  for (const { rows } of runs) {
    for (const r of rows) {
      if (r.kind !== "gold" || !r.isV0Field || r.goldStatus === "N/A") continue;
      if (r.rowNumber === null) continue;
      const entry = statuses.get(r.rowNumber) ?? {
        fieldId: r.fieldId,
        seen: new Set<string>(),
      };
      entry.seen.add(r.modelStatus);
      statuses.set(r.rowNumber, entry);
    }
  }
  const perFieldCounts: Record<string, { same: number; total: number }> = {};
  let same = 0;
  for (const { fieldId, seen } of statuses.values()) {
    const c = (perFieldCounts[fieldId] ??= { same: 0, total: 0 });
    c.total++;
    if (seen.size === 1) {
      c.same++;
      same++;
    }
  }
  const perField: Record<string, number> = {};
  for (const [id, c] of Object.entries(perFieldCounts)) {
    perField[id] = c.same / c.total;
  }
  return {
    minMax,
    sameStatusShare: statuses.size === 0 ? 0 : same / statuses.size,
    perField,
  };
}

const avg = (values: number[]) =>
  values.length === 0 ? 0 : values.reduce((a, b) => a + b, 0) / values.length;
const pct = (share: number) => `${(share * 100).toFixed(1)}%`;
const num = (n: number) => String(Math.round(n * 100) / 100);

export function consistencyMarkdown(
  input: ConsistencyInput,
  skipped: string[] = [],
): string {
  const { runs } = input;
  const result = consistency(input);
  const lines = [
    "# Consistency across runs",
    "",
    `Runs considered: ${runs.length}`,
  ];
  if (skipped.length > 0) lines.push(`Skipped: ${skipped.join(", ")}`);
  lines.push(
    "",
    `Same status in every run (v0 gold rows): ${pct(result.sameStatusShare)}`,
    "",
    "| Field | Same status |",
    "| --- | --- |",
    ...Object.entries(result.perField)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([id, share]) => `| ${id} | ${pct(share)} |`),
    "",
    "| Run | Minutes | Values kept | Values dropped | Prompt tokens | Completion tokens |",
    "| --- | --- | --- | --- | --- | --- |",
    ...runs.map(
      ({ stats: s }) =>
        `| ${s.run} | ${num(s.minutes)} | ${s.valuesKept} | ${s.valuesDropped} | ${s.promptTokens} | ${s.completionTokens} |`,
    ),
    "",
  );
  for (const [key, label] of [
    ["valuesKept", "Values kept"],
    ["valuesDropped", "Values dropped"],
    ["minutes", "Minutes"],
  ] as const) {
    const { min, max } = result.minMax[key];
    lines.push(`- ${label}: min ${num(min)}, max ${num(max)}`);
  }
  lines.push(
    `- Average minutes: ${num(avg(runs.map((r) => r.stats.minutes)))}`,
    `- Max minutes: ${num(result.minMax.minutes.max)}`,
    `- Average prompt tokens: ${num(avg(runs.map((r) => r.stats.promptTokens)))}`,
    `- Average completion tokens: ${num(avg(runs.map((r) => r.stats.completionTokens)))}`,
    "",
  );
  return lines.join("\n");
}

async function main() {
  const i = process.argv.indexOf("--dir");
  const dir = i >= 0 ? process.argv[i + 1] : undefined;
  if (!dir) throw new Error("Missing --dir");

  const numbers = (await readdir(dir))
    .map((f) => /^run-(\d+)\.json$/.exec(f))
    .filter((m): m is RegExpExecArray => m !== null)
    .map((m) => Number(m[1]))
    .sort((a, b) => a - b);
  const runs: ConsistencyRun[] = [];
  const skipped: string[] = [];
  for (const n of numbers) {
    const { stats } = JSON.parse(
      await readFile(path.join(dir, `run-${n}.json`), "utf8"),
    ) as { stats: RunStats };
    if (stats.status !== "ok") {
      skipped.push(`run-${n} (failed)`);
      continue;
    }
    try {
      const rows = JSON.parse(
        await readFile(path.join(dir, `score-run-${n}`, "scored.json"), "utf8"),
      ) as ScoredRow[];
      runs.push({ stats, rows });
    } catch {
      skipped.push(`run-${n} (not scored)`);
    }
  }
  if (runs.length === 0) throw new Error("No scored runs to compare");
  const out = path.join(dir, "consistency.md");
  await writeFile(out, consistencyMarkdown({ runs }, skipped));
  console.log(`Wrote ${out}`);
}

if (
  process.argv[1] &&
  pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url
) {
  main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
  });
}
