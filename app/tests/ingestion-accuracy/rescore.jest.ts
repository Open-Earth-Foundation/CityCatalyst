/**
 * Rescores stored benchmark runs with the current scorer and answer keys, with
 * no LLM or OCR call. Use it when the scorer or the keys change, so old and new
 * runs are compared under the same rules. Skipped unless INGESTION_RESCORE=1.
 *
 * INGESTION_RESCORE_FROM is a comma-separated list of results.json files; for a
 * case present in several files the last file wins. Only the cases listed in
 * INGESTION_RESCORE_CASES (comma-separated) are rescored; the others are copied.
 *
 *   INGESTION_RESCORE=1 \
 *   INGESTION_RESCORE_FROM=<old>/results.json,<newer>/results.json \
 *   INGESTION_RESCORE_CASES=C-004,C-005 \
 *   INGESTION_RESCORE_KEYS=<answer-keys.json> \
 *   INGESTION_RESCORE_OUT=<dir> \
 *   NODE_OPTIONS=--experimental-vm-modules NODE_ENV=test \
 *   npx jest tests/ingestion-accuracy/rescore --coverage=false
 */
import { describe, expect, it } from "@jest/globals";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { renderReport, type CaseResult, type RunSummary } from "./report";
import { scoreFile, type KeyFile } from "./score";

const RUN = process.env.INGESTION_RESCORE === "1";

/** Same rule as the benchmark: all finished runs store the same rounded total. */
function stableTotal(result: CaseResult): boolean {
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

(RUN ? describe : describe.skip)("rescore stored runs", () => {
  it("writes a rescored results.json and report.md", () => {
    const sources = process.env.INGESTION_RESCORE_FROM!.split(",");
    const cases = new Set(
      (process.env.INGESTION_RESCORE_CASES ?? "").split(",").filter(Boolean),
    );
    const keys = JSON.parse(
      readFileSync(process.env.INGESTION_RESCORE_KEYS!, "utf8"),
    ) as { files: Record<string, KeyFile> };
    const outDir = process.env.INGESTION_RESCORE_OUT!;

    const summaries = sources.map(
      (path) => JSON.parse(readFileSync(path, "utf8")) as RunSummary,
    );
    const byId = new Map<string, CaseResult>();
    const order: string[] = [];
    for (const summary of summaries) {
      for (const result of summary.results) {
        if (!byId.has(result.id)) order.push(result.id);
        byId.set(result.id, result);
      }
    }
    const results = order.map((id) => {
      const result = byId.get(id)!;
      const key = keys.files[id];
      if (!cases.has(id)) return result;
      if (!key) throw new Error(`No answer key for ${id}`);
      return rescoreCase(result, key);
    });

    const base = summaries[0];
    const summary: RunSummary = {
      ...base,
      measuredAt: new Date().toISOString(),
      commit: summaries.map((entry) => entry.commit).join("+"),
      results,
    };
    mkdirSync(outDir, { recursive: true });
    writeFileSync(
      join(outDir, "results.json"),
      JSON.stringify(summary, null, 2),
    );
    writeFileSync(join(outDir, "report.md"), renderReport(summary, base));
    expect(results.length).toBe(order.length);
  });
});
