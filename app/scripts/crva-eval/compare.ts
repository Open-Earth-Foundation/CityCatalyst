/**
 * Compares run directories (v0, agent A, agent B) in one markdown table.
 *
 *   npx tsx scripts/crva-eval/compare.ts --label v0 --dir <run dir> --label A --dir <run dir> \
 *     --label B --dir <run dir> [--out <file>]
 *
 * Reads run-<n>.json and score-run-<n>/scored.json of each directory. Failed
 * runs and ok runs without a score are counted apart and left out of the numbers.
 */
import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { coverage, precision, summarize } from "./report";
import type { RunStats } from "./run-adapter";
import type { ScoredRow } from "./types";

export interface CompareInput {
  label: string;
  /** Stats of every run in the directory. */
  stats: RunStats[];
  /** Rows of each run, aligned with `stats`; null when the run is not scored. */
  scored: (ScoredRow[] | null)[];
}

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
const mean = (xs: number[]) =>
  xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length;

/** One value for a single run, "min–max" for several. */
function range(xs: number[], fmt: (x: number) => string): string {
  if (xs.length === 0) return "—";
  const lo = Math.min(...xs);
  const hi = Math.max(...xs);
  return lo === hi ? fmt(lo) : `${fmt(lo)}–${fmt(hi)}`;
}

const rate = (v: { hits: number; total: number }) =>
  v.total === 0 ? 0 : v.hits / v.total;

const HEADER = [
  "Label",
  "Runs",
  "Share correct, v0 fields, accepted (min–max)",
  "v0 coverage, accepted (mean)",
  "Precision, accepted (mean)",
  "Values kept (mean)",
  "Dropped % (mean)",
  "Minutes (mean)",
  "Prompt tokens (mean)",
  "Completion tokens (mean)",
  "Model turns (mean)",
];

/**
 * One row per label. The v0 numbers use the same row filter and functions as
 * report.md, so they match it for a single run.
 */
export function compareRows(inputs: CompareInput[]): string {
  const lines = [
    `| ${HEADER.join(" | ")} |`,
    `| ${HEADER.map(() => "---").join(" | ")} |`,
  ];
  for (const { label, scored, stats } of inputs) {
    // Every number comes from the same runs: ok and scored.
    const used = stats.flatMap((s, i) => {
      const rows = scored[i];
      return s.status === "ok" && rows ? [{ stats: s, rows }] : [];
    });
    const failed = stats.filter((s) => s.status !== "ok").length;
    const unscored = stats.filter(
      (s, i) => s.status === "ok" && !scored[i],
    ).length;
    const extra = [
      ...(failed ? [`${failed} failed`] : []),
      ...(unscored ? [`${unscored} unscored`] : []),
    ];
    const v0 = used.map((u) => u.rows.filter((r) => r.isV0Field));
    const dropped = used.map(({ stats: s }) => {
      const total = s.valuesKept + s.valuesDropped;
      return total === 0 ? 0 : s.valuesDropped / total;
    });
    const turns = used
      .map((u) => u.stats.modelTurns)
      .filter((t): t is number => t !== undefined);
    const avg = (f: (s: RunStats) => number, fmt: (x: number) => string) =>
      used.length ? fmt(mean(used.map((u) => f(u.stats)))) : "—";
    const cells = [
      label,
      extra.length ? `${used.length} (${extra.join(", ")})` : `${used.length}`,
      range(
        used.map(
          (u) => summarize(u.rows, (r) => r.isV0Field).shareCorrectAccepted,
        ),
        pct,
      ),
      used.length ? pct(mean(v0.map((r) => rate(coverage(r).accepted)))) : "—",
      used.length ? pct(mean(v0.map((r) => rate(precision(r).accepted)))) : "—",
      avg(
        (s) => s.valuesKept,
        (x) => x.toFixed(1),
      ),
      used.length ? pct(mean(dropped)) : "—",
      avg(
        (s) => s.minutes,
        (x) => x.toFixed(1),
      ),
      avg(
        (s) => s.promptTokens,
        (x) => String(Math.round(x)),
      ),
      avg(
        (s) => s.completionTokens,
        (x) => String(Math.round(x)),
      ),
      turns.length ? mean(turns).toFixed(0) : "—",
    ];
    lines.push(`| ${cells.join(" | ")} |`);
  }
  return lines.join("\n");
}

async function readDir(label: string, dir: string): Promise<CompareInput> {
  const numbers = (await readdir(dir))
    .map((f) => /^run-(\d+)\.json$/.exec(f))
    .filter((m): m is RegExpExecArray => m !== null)
    .map((m) => Number(m[1]))
    .sort((a, b) => a - b);
  const scored: (ScoredRow[] | null)[] = [];
  const stats: RunStats[] = [];
  for (const n of numbers) {
    const run = JSON.parse(
      await readFile(path.join(dir, `run-${n}.json`), "utf8"),
    ) as { stats: RunStats };
    stats.push(run.stats);
    try {
      scored.push(
        JSON.parse(
          await readFile(
            path.join(dir, `score-run-${n}`, "scored.json"),
            "utf8",
          ),
        ) as ScoredRow[],
      );
    } catch {
      scored.push(null);
    }
  }
  return { label, scored, stats };
}

function values(flag: string): string[] {
  const out: string[] = [];
  process.argv.forEach((a, i) => {
    if (a === flag && process.argv[i + 1]) out.push(process.argv[i + 1]);
  });
  return out;
}

async function main() {
  const labels = values("--label");
  const dirs = values("--dir");
  if (labels.length === 0 || labels.length !== dirs.length) {
    throw new Error("Pass the same number of --label and --dir pairs");
  }
  const inputs = await Promise.all(labels.map((l, i) => readDir(l, dirs[i])));
  const table = compareRows(inputs) + "\n";
  const out = values("--out")[0];
  if (out) await writeFile(out, table);
  console.log(table);
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
