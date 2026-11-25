/**
 * Runs the CRVA adapter on one PDF several times and saves each run.
 *
 *   npx tsx scripts/crva-eval/run-adapter.ts --pdf <path> --city <slug> --runs <n> [--max-part-mib 15]
 *
 * Output: app/reports/crva-eval/<city>/<timestamp>/run-<n>.json and runs.md.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import env from "@next/env";
import { IngestRunner } from "@/backend/ingest/IngestRunner";
import { MemoryIngestStore } from "@/backend/ingest/MemoryIngestStore";
import { CcraIngestPlugin } from "@/backend/ingest/plugins/CcraIngestPlugin";
import {
  CRVA_FIELD_IDS,
  type CrvaDraftBundle,
} from "@/backend/ingest/plugins/ccra/draft-schema";
import { createLLMClient, type LLMClient } from "@/backend/llm";
import { recordingClient } from "./llm-recorder";
import { mergePartBundles } from "./merge-bundles";
import { DEFAULT_MAX_PART_BYTES, splitPdf } from "./split-pdf";
import { formatPartPages, type PartRange } from "./types";

/** The runner requires a scope, and nothing is stored, so any UUID works. */
const EVAL_CITY_ID = "00000000-0000-4000-8000-00000000c1a5";
const MAX_PART_RETRIES = 2;
/** app/, two levels up from this script, so reports land there from any cwd. */
export const APP_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
);
const MAX_EXTRA_FAILED_RUNS = 2;

export interface RunStats {
  run: number;
  status: "ok" | "failed";
  minutes: number;
  parts: number;
  /** Pages of the original PDF in each part; missing in run files written before it existed. */
  partRanges?: PartRange[];
  retries: number;
  ocrPages: number;
  promptTokens: number;
  completionTokens: number;
  llmCalls: number;
  nonStopFinishes: number;
  valuesKept: number;
  valuesDropped: number;
  droppedByReason: Record<string, number>;
  fieldsWithValue: number;
  figures: number;
  warnings: number;
  error?: string;
}

export interface RunOnceInput {
  pdf: Buffer;
  fileName: string;
  run: number;
  maxPartBytes?: number;
  /** Builds the plugin around the recording LLM factory it is given. */
  plugin?: (llm: () => LLMClient) => CcraIngestPlugin;
  /** The real client by default; tests inject a stub. */
  llm?: () => LLMClient;
}

/** One part through the real runner. Throws when the item does not reach review. */
async function runPart(
  buffer: Buffer,
  fileName: string,
  plugin: CcraIngestPlugin,
): Promise<CrvaDraftBundle> {
  const store = new MemoryIngestStore();
  const runner = new IngestRunner(store);
  // dryRun must stay false: a dry run skips the review draft and loses the bundle.
  const job = await runner.enqueue({
    moduleId: "ccra",
    files: [{ name: fileName, buffer }],
    dryRun: false,
    scope: { cityId: EVAL_CITY_ID },
  });
  await runner.run(job.id, plugin);
  const [item] = await store.listItems(job.id);
  const payload = item?.reviewDraft?.payload;
  if (item?.status !== "awaiting_review" || !payload) {
    throw new Error(
      item?.errorLog ?? `item ended as ${item?.status}, no review draft`,
    );
  }
  return payload as CrvaDraftBundle;
}

export async function runOnce(input: RunOnceInput): Promise<{
  bundle: CrvaDraftBundle | null;
  warnings: string[];
  stats: RunStats;
}> {
  const started = Date.now();
  const { client, calls } = recordingClient((input.llm ?? createLLMClient)());
  const makePlugin =
    input.plugin ?? ((llm: () => LLMClient) => new CcraIngestPlugin({ llm }));
  const plugin = makePlugin(() => client);

  const parts = await splitPdf(
    input.pdf,
    input.maxPartBytes ?? DEFAULT_MAX_PART_BYTES,
  );
  let retries = 0;
  let ocrPages = 0;
  let error: string | undefined;
  const bundles: { startPage: number; bundle: CrvaDraftBundle }[] = [];

  for (const part of parts) {
    for (let attempt = 0; ; attempt++) {
      try {
        const bundle = await runPart(part.buffer, input.fileName, plugin);
        bundles.push({ startPage: part.startPage, bundle });
        ocrPages += bundle.pageCount ?? part.pageCount;
        break;
      } catch (err) {
        if (attempt >= MAX_PART_RETRIES) {
          error = `part ${part.index + 1}: ${err instanceof Error ? err.message : String(err)}`;
          break;
        }
        retries++;
      }
    }
    if (error) break;
  }

  const merged = error
    ? null
    : mergePartBundles(bundles, {
        file: input.fileName,
        pageCount: parts.reduce((sum, p) => sum + p.pageCount, 0),
      });
  // The plugin ignores the context argument of validate.
  const warnings = merged
    ? (await plugin.validate(undefined as never, merged)).warnings
    : [];

  const droppedByReason: Record<string, number> = {};
  for (const d of merged?.dropped ?? []) {
    droppedByReason[d.reason] = (droppedByReason[d.reason] ?? 0) + 1;
  }

  const stats: RunStats = {
    run: input.run,
    status: merged ? "ok" : "failed",
    minutes: Math.round(((Date.now() - started) / 60_000) * 10) / 10,
    parts: parts.length,
    partRanges: parts.map((p) => ({
      startPage: p.startPage,
      pageCount: p.pageCount,
      bytes: p.buffer.length,
    })),
    retries,
    ocrPages,
    promptTokens: calls.reduce((sum, c) => sum + c.promptTokens, 0),
    completionTokens: calls.reduce((sum, c) => sum + c.completionTokens, 0),
    llmCalls: calls.length,
    nonStopFinishes: calls.filter((c) => c.finishReason !== "stop").length,
    valuesKept: merged?.values.length ?? 0,
    valuesDropped: merged?.dropped.length ?? 0,
    droppedByReason,
    fieldsWithValue: merged
      ? CRVA_FIELD_IDS.length - merged.uncoveredFields.length
      : 0,
    figures: merged?.figures.length ?? 0,
    warnings: warnings.length,
    ...(error ? { error } : {}),
  };
  return { bundle: merged, warnings, stats };
}

function droppedShare(s: RunStats): string {
  const total = s.valuesKept + s.valuesDropped;
  return total === 0
    ? "n/a"
    : `${((s.valuesDropped / total) * 100).toFixed(1)}%`;
}

function droppedByReason(s: RunStats): string {
  const entries = Object.entries(s.droppedByReason);
  if (entries.length === 0) return "none";
  return entries.map(([reason, n]) => `${reason} ${n}`).join(", ");
}

/** Same rows as the Madrid table in docs/CrvaIngestAdapter.md, one column per run. */
export function runsTableMarkdown(stats: RunStats[]): string {
  const rows: [string, (s: RunStats) => string | number][] = [
    ["Final state", (s) => (s.status === "ok" ? "review" : "failed")],
    [
      `Fields with at least one value (of ${CRVA_FIELD_IDS.length})`,
      (s) => s.fieldsWithValue,
    ],
    ["Values kept", (s) => s.valuesKept],
    ["Values dropped", (s) => s.valuesDropped],
    ["Dropped share", droppedShare],
    ["Figures listed", (s) => s.figures],
    ["Warnings", (s) => s.warnings],
    ["LLM calls", (s) => s.llmCalls],
    ["Calls not finished with stop", (s) => s.nonStopFinishes],
    ["Prompt tokens", (s) => s.promptTokens],
    ["Completion tokens", (s) => s.completionTokens],
    ["OCR pages", (s) => s.ocrPages],
    ["Parts", (s) => s.parts],
    [
      "Part pages",
      (s) =>
        s.partRanges?.length ? formatPartPages(s.partRanges) : "not recorded",
    ],
    ["Dropped by reason", droppedByReason],
    ["Part retries", (s) => s.retries],
    ["Minutes", (s) => s.minutes],
  ];
  const header = `| Measure | ${stats.map((s) => `Run ${s.run}`).join(" | ")} |`;
  const divider = `| --- | ${stats.map(() => "---").join(" | ")} |`;
  const body = rows.map(
    ([label, get]) => `| ${label} | ${stats.map(get).join(" | ")} |`,
  );
  return [header, divider, ...body].join("\n") + "\n";
}

/** Keeps going until enough runs completed, or the failure cap is reached. */
export function shouldStartRun(
  wanted: number,
  completed: number,
  failed: number,
): boolean {
  return completed < wanted && failed < MAX_EXTRA_FAILED_RUNS;
}

/** The --runs value, or null when it is not a positive integer. */
export function parseRunCount(text: string): number | null {
  const n = Number(text);
  return text.trim() !== "" && Number.isInteger(n) && n > 0 ? n : null;
}

function argValue(flag: string, fallback?: string): string {
  const i = process.argv.indexOf(flag);
  const value = i >= 0 ? process.argv[i + 1] : fallback;
  if (!value) throw new Error(`Missing ${flag}`);
  return value;
}

async function main() {
  env.loadEnvConfig(process.cwd());
  const pdfPath = argValue("--pdf");
  const city = argValue("--city");
  const runs = parseRunCount(argValue("--runs", "1"));
  if (runs === null) {
    console.error("--runs must be a positive integer");
    process.exitCode = 1;
    return;
  }
  const maxPartBytes = Number(argValue("--max-part-mib", "15")) * 1024 * 1024;

  const pdf = await readFile(pdfPath);
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outDir = path.join(APP_DIR, "reports", "crva-eval", city, stamp);
  await mkdir(outDir, { recursive: true });

  const all: RunStats[] = [];
  let completed = 0;
  let failed = 0;
  // Failed runs are kept on disk, but only 2 extra failures are tolerated.
  for (let run = 1; shouldStartRun(runs, completed, failed); run++) {
    const { bundle, warnings, stats } = await runOnce({
      pdf,
      fileName: path.basename(pdfPath),
      run,
      maxPartBytes,
    });
    await writeFile(
      path.join(outDir, `run-${run}.json`),
      JSON.stringify({ stats, warnings, bundle }, null, 2),
    );
    all.push(stats);
    if (stats.status === "ok") completed++;
    else failed++;
    console.log(
      `run ${run}: ${stats.status}${stats.error ? ` (${stats.error})` : ""}`,
    );
  }
  await writeFile(path.join(outDir, "runs.md"), runsTableMarkdown(all));
  console.log(`Wrote ${outDir}`);
  if (completed < runs) process.exitCode = 1;
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
