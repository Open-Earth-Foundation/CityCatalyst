/**
 * Wave 3 item 9: combines the converted v0 values of several runs of one report,
 * per field, by majority vote or union, and writes one harness run file that
 * scripts/crva-eval/score-run.ts scores unchanged. Offline: no agent calls.
 *
 *   npx tsx scripts/crva-mirco/combine.ts --mode vote|union [--min 2] \
 *     --out <dir>/run-<n>.json <run-a.json> <run-b.json> [<run-c.json>...]
 *
 * Matching: a field's key (A1.2a name and year; name; hazard × group or sector;
 * factor; title; or the text itself), word tokens without accents, stopwords
 * and plural "s". Two values match when key overlap (Jaccard) is at least 0.6, or
 * at least 0.4 with whole-value overlap at least 0.5; A1.2a also needs the same
 * year. A cluster keeps the value with the longest quote.
 */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  CRVA_FIELD_IDS,
  type CrvaDraftBundle,
  type CrvaDraftValue,
} from "@/backend/ingest/plugins/ccra/draft-schema";
import type { RunStats } from "../crva-eval/run-adapter";

const KEY_MATCH = 0.6;
const KEY_NEAR = 0.4;
const VALUE_MATCH = 0.5;

const STOPWORDS = new Set(
  "de del la las el los y e en a al con por para un una o the of and in on to for".split(
    " ",
  ),
);

function fold(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function tokens(text: string): Set<string> {
  return new Set(
    fold(text)
      .split(" ")
      .filter((t) => t && !STOPWORDS.has(t))
      .map((t) => (t.length > 3 && t.endsWith("s") ? t.slice(0, -1) : t)),
  );
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter += 1;
  return inter / (a.size + b.size - inter);
}

type Parts = Record<string, unknown>;
const str = (x: unknown) => (typeof x === "string" ? x : "");

/** The normalised identifying text of a value. */
export function valueKey(value: CrvaDraftValue): string {
  const v = value.value as unknown;
  if (typeof v === "string") return fold(v);
  const p = (v ?? {}) as Parts;
  switch (value.fieldId) {
    case "C1.1a":
      return fold(`${str(p.hazard)} ${str(p.group)}`);
    case "C1.2a":
      return fold(`${str(p.hazard)} ${str(p.sector)}`);
    case "D1.1a":
    case "D1.2a":
      return fold(str(p.factor));
    case "E1.1a":
      return fold(str(p.title));
    default:
      return fold(str(p.name));
  }
}

function wholeText(value: CrvaDraftValue): string {
  const v = value.value as unknown;
  if (typeof v === "string") return v;
  return Object.values((v ?? {}) as Parts)
    .flat()
    .filter((x) => typeof x === "string")
    .join(" ");
}

/** Whether two values of different runs state the same item. */
export function sameValue(a: CrvaDraftValue, b: CrvaDraftValue): boolean {
  if (a.fieldId !== b.fieldId) return false;
  if (a.fieldId === "A1.2a") {
    const year = (x: CrvaDraftValue) =>
      ((x.value as Parts | null)?.year ?? null) as unknown;
    if (year(a) !== year(b)) return false;
  }
  const key = jaccard(tokens(valueKey(a)), tokens(valueKey(b)));
  if (key >= KEY_MATCH) return true;
  return (
    key >= KEY_NEAR &&
    jaccard(tokens(wholeText(a)), tokens(wholeText(b))) >= VALUE_MATCH
  );
}

export interface Cluster {
  values: CrvaDraftValue[];
  /** Index of the run each value came from. */
  runs: number[];
}

/** Greedy clustering: each value joins the first matching cluster that has no value from its run. */
export function clusterValues(runs: CrvaDraftValue[][]): Cluster[] {
  const clusters: Cluster[] = [];
  runs.forEach((values, run) => {
    for (const value of values) {
      const target = clusters.find(
        (c) =>
          !c.runs.includes(run) && c.values.some((x) => sameValue(x, value)),
      );
      if (target) {
        target.values.push(value);
        target.runs.push(run);
      } else {
        clusters.push({ values: [value], runs: [run] });
      }
    }
  });
  return clusters;
}

const longestQuote = (c: Cluster) =>
  c.values.reduce((best, v) =>
    v.source.quote.length > best.source.quote.length ? v : best,
  );

/** Values found in at least `min` runs, one per cluster. */
export function voteValues(
  runs: CrvaDraftValue[][],
  min: number,
): CrvaDraftValue[] {
  return clusterValues(runs)
    .filter((c) => new Set(c.runs).size >= min)
    .map(longestQuote);
}

/** Every value once, one per cluster. */
export function unionValues(runs: CrvaDraftValue[][]): CrvaDraftValue[] {
  return clusterValues(runs).map(longestQuote);
}

/** A bundle of the combined values; dropped values are not combined. */
export function combinedBundle(
  bundles: CrvaDraftBundle[],
  values: CrvaDraftValue[],
): CrvaDraftBundle {
  const covered = new Set(values.map((v) => v.fieldId as string));
  return {
    ...bundles[0],
    values,
    uncoveredFields: CRVA_FIELD_IDS.filter((id) => !covered.has(id)),
    dropped: [],
  };
}

/** Stats of a combined run: the tokens and calls of every run it used; wall time of the slowest. */
export function combinedStats(stats: RunStats[], values: number): RunStats {
  const sum = (k: keyof RunStats) =>
    stats.reduce((t, s) => t + ((s[k] as number) ?? 0), 0);
  return {
    ...stats[0],
    minutes: Math.max(...stats.map((s) => s.minutes)),
    promptTokens: sum("promptTokens"),
    completionTokens: sum("completionTokens"),
    cachedInputTokens: sum("cachedInputTokens"),
    llmCalls: sum("llmCalls"),
    modelTurns: sum("modelTurns"),
    valuesKept: values,
    valuesDropped: 0,
    droppedByReason: {},
  };
}

async function main() {
  const arg = (flag: string, fallback?: string) => {
    const i = process.argv.indexOf(flag);
    const value = i >= 0 ? process.argv[i + 1] : fallback;
    if (!value) throw new Error(`Missing ${flag}`);
    return value;
  };
  const mode = arg("--mode");
  if (mode !== "vote" && mode !== "union")
    throw new Error("--mode must be vote or union");
  const min = Number(arg("--min", "2"));
  const out = path.resolve(arg("--out"));
  const flags = new Set(["--mode", "--min", "--out"]);
  const inputs = process.argv
    .slice(2)
    .filter((a, i, all) => !flags.has(a) && !flags.has(all[i - 1] ?? ""));
  if (inputs.length < 2) throw new Error("Give at least two run files");
  const runs = await Promise.all(
    inputs.map(async (f) => JSON.parse(await readFile(f, "utf8"))),
  );
  const bundles = runs.map((r) => r.bundle as CrvaDraftBundle);
  const valuesPerRun = bundles.map((b) => b.values);
  const values =
    mode === "vote" ? voteValues(valuesPerRun, min) : unionValues(valuesPerRun);
  const stats = combinedStats(
    runs.map((r) => r.stats as RunStats),
    values.length,
  );
  const run = Number(path.basename(out).match(/run-(\d+)\.json$/)?.[1] ?? 1);
  await writeFile(
    out,
    JSON.stringify(
      {
        stats: { ...stats, run },
        warnings: [],
        bundle: combinedBundle(bundles, values),
        combined: {
          mode,
          min: mode === "vote" ? min : null,
          inputs,
          valuesPerRun: valuesPerRun.map((v) => v.length),
          kept: values.length,
        },
      },
      null,
      2,
    ),
  );
  console.log(
    `${mode}: ${valuesPerRun.map((v) => v.length).join(" + ")} values -> ${values.length}; wrote ${out}`,
  );
}

if (
  process.argv[1] &&
  pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url
) {
  main().catch((err) => {
    console.error(err instanceof Error ? (err.stack ?? err.message) : err);
    process.exitCode = 1;
  });
}
