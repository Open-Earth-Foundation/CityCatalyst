/**
 * Per-case baseline of the PDF extraction benchmark (spec 6.3). Each entry
 * stores the verdict of the last full run of a case plus the test-set version
 * (a hash of the manifest entry and answer key) it was scored against. When the
 * version changed, the baseline is rescored from the stored run with the
 * current key, so old and new runs are compared under the same answer key.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { KeyFile } from "@/backend/ingestion-benchmark/answer-keys";
import {
  caseVerdict,
  type CaseVerdict,
} from "@/backend/ingestion-benchmark/metrics";
import type { Prices, RunSummary } from "@/backend/ingestion-benchmark/report";
import { rescoreCase } from "@/backend/ingestion-benchmark/rescore";
import type { CaseManifestEntry } from "@/backend/ingestion-benchmark/selection";

const REQUIRED_ATTEMPTS = 3;

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .filter((k) => record[k] !== undefined)
      .map((k) => `${JSON.stringify(k)}:${stableStringify(record[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

const sha = (text: string) =>
  createHash("sha256").update(text).digest("hex").slice(0, 12);

export function caseTestSetVersion(
  entry: CaseManifestEntry,
  key: KeyFile,
): string {
  return sha(stableStringify({ entry, key }));
}

export function combinedTestSetVersion(versions: string[]): string {
  return sha([...versions].sort().join(","));
}

export type BaselineEntry = {
  verdict: CaseVerdict;
  commit: string;
  extractionModel: string | null;
  ocrModel: string | null;
  promptHash: string | null;
  testSetVersion: string;
  runFolder: string;
  date: string;
};

export type Baseline = Record<string, BaselineEntry>;

export function loadBaseline(path: string): Baseline {
  if (!existsSync(path)) return {};
  return JSON.parse(readFileSync(path, "utf8")) as Baseline;
}

export function saveBaseline(path: string, baseline: Baseline): void {
  const sorted = Object.fromEntries(
    Object.keys(baseline)
      .sort()
      .map((id) => [id, baseline[id]]),
  );
  writeFileSync(path, `${JSON.stringify(sorted, null, 2)}\n`);
}

export type Comparison = {
  id: string;
  status: "compared" | "no baseline" | "baseline stale";
  baseline: CaseVerdict | null;
  rescored: boolean;
};

export function compareWithBaseline(args: {
  id: string;
  current: CaseVerdict;
  currentVersion: string;
  baseline: Baseline;
  key: KeyFile;
  runsRoot: string;
  prices?: Prices;
}): Comparison {
  const { id, currentVersion, baseline, key, runsRoot, prices } = args;
  const entry = baseline[id];
  if (!entry) {
    return { id, status: "no baseline", baseline: null, rescored: false };
  }
  if (entry.testSetVersion === currentVersion) {
    return {
      id,
      status: "compared",
      baseline: entry.verdict,
      rescored: false,
    };
  }
  const stale: Comparison = {
    id,
    status: "baseline stale",
    baseline: null,
    rescored: false,
  };
  try {
    const file = join(runsRoot, entry.runFolder, "results.json");
    if (!existsSync(file)) return stale;
    const summary = JSON.parse(readFileSync(file, "utf8")) as RunSummary;
    const stored = summary.results.find((result) => result.id === id);
    if (!stored) return stale;
    const rescored = caseVerdict(rescoreCase(stored, key), key, prices);
    return { id, status: "compared", baseline: rescored, rescored: true };
  } catch {
    return stale;
  }
}

export function updateBaseline(args: {
  baseline: Baseline;
  entries: Record<string, BaselineEntry>;
  exploratory: boolean;
  interrupted: boolean;
}): Baseline {
  const { baseline, entries, exploratory, interrupted } = args;
  if (exploratory || interrupted) return baseline;
  const complete = Object.fromEntries(
    Object.entries(entries).filter(
      ([, entry]) => entry.verdict.attempts >= REQUIRED_ATTEMPTS,
    ),
  );
  return { ...baseline, ...complete };
}
