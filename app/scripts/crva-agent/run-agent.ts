/**
 * Runs the agentic CRVA extractor and saves each run in the harness's run-file shape,
 * so scripts/crva-eval/score-run.ts scores it unchanged. Paid: OpenAI calls per run.
 *
 *   LLM_BASE_URL="" npx tsx scripts/crva-agent/run-agent.ts --variant A|B --city <slug> \
 *     --pdf <path> --ocr reports/crva-eval/<city>/ocr [--runs 1] [--max-turns 150] [--timeout-min 30]
 *
 * Output: app/reports/crva-eval/<city>/agent-<a|b>/<timestamp>/run-<n>.json and runs.md.
 */
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import env from "@next/env";
import { CcraIngestPlugin } from "@/backend/ingest/plugins/CcraIngestPlugin";
import type { CrvaDraftBundle } from "@/backend/ingest/plugins/ccra/draft-schema";
import { loadLLMConfig } from "@/backend/llm";
import { readOcrCache, type OcrCache } from "../crva-eval/ocr-cache";
import {
  APP_DIR,
  parseRunCount,
  runsTableMarkdown,
  type RunStats,
} from "../crva-eval/run-adapter";
import { runAgent } from "./agent";
import { assembleBundle, parseValuesJsonl } from "./assemble";
import type { Variant } from "./instructions";
import {
  prepareWorkspace,
  statsFromAgent,
  type AgentRunResult,
} from "./run-stats";

function argValue(flag: string, fallback?: string): string {
  const i = process.argv.indexOf(flag);
  const value = i >= 0 ? process.argv[i + 1] : fallback;
  if (!value) throw new Error(`Missing ${flag}`);
  return value;
}

/** One run in a fresh temp workspace, removed afterwards. Never throws for a run failure. */
async function runOnce(input: {
  run: number;
  variant: Variant;
  pdfPath: string;
  ocr: OcrCache;
  model: string;
  maxTurns: number;
  timeoutMin: number;
}): Promise<{
  stats: RunStats;
  warnings: string[];
  bundle: CrvaDraftBundle | null;
}> {
  const started = Date.now();
  const workspaceDir = await mkdtemp(path.join(os.tmpdir(), "crva-agent-"));
  let result: AgentRunResult;
  try {
    await prepareWorkspace(
      input.variant,
      workspaceDir,
      input.ocr,
      input.pdfPath,
    );
    result = await runAgent({
      variant: input.variant,
      workspaceDir,
      pageCount: input.ocr.pageCount,
      model: input.model,
      maxTurns: input.maxTurns,
      timeoutMs: input.timeoutMin * 60_000,
    });
  } catch (err) {
    // Any non-cap failure becomes a failed run, so the other runs still happen.
    result = {
      outputText: null,
      usage: { promptTokens: 0, completionTokens: 0 },
      modelTurns: 0,
      toolCalls: 0,
      error: err instanceof Error ? err.message : String(err),
    };
  } finally {
    // A cleanup failure (EBUSY/EPERM on Windows) must not abort the remaining paid runs.
    try {
      await rm(workspaceDir, {
        recursive: true,
        force: true,
        maxRetries: 3,
        retryDelay: 200,
      });
    } catch (err) {
      console.warn(
        `could not remove ${workspaceDir}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  // A capped or failed run never becomes a bundle, even if the agent wrote output.
  let bundle: CrvaDraftBundle | null = null;
  if (!result.error && result.outputText !== null) {
    const { candidates, badLines } = parseValuesJsonl(result.outputText);
    bundle = assembleBundle({
      file: input.ocr.file,
      candidates,
      badLines,
      ocr: input.ocr,
      extractionModel: input.model,
    });
  }
  const warnings = bundle
    ? (await new CcraIngestPlugin().validate(undefined as never, bundle))
        .warnings
    : [];
  const minutes = Math.round(((Date.now() - started) / 60_000) * 10) / 10;
  const stats = {
    ...statsFromAgent(input.run, result, bundle, minutes, input.ocr),
    warnings: warnings.length,
  };
  return { stats, warnings, bundle };
}

async function main() {
  env.loadEnvConfig(process.cwd());
  const variantArg = argValue("--variant").toUpperCase();
  if (variantArg !== "A" && variantArg !== "B") {
    console.error("--variant must be A or B");
    process.exitCode = 1;
    return;
  }
  const variant: Variant = variantArg;
  const city = argValue("--city");
  // Only variant B copies the PDF into the workspace; A works from the OCR pages.
  const pdfPath = variant === "B" ? argValue("--pdf") : "";
  const runs = parseRunCount(argValue("--runs", "1"));
  const maxTurns = parseRunCount(argValue("--max-turns", "150"));
  const timeoutMin = Number(argValue("--timeout-min", "30"));
  if (runs === null || maxTurns === null || !(timeoutMin > 0)) {
    console.error(
      "--runs and --max-turns must be positive integers, --timeout-min a positive number",
    );
    process.exitCode = 1;
    return;
  }

  if (variant === "B" && !existsSync(pdfPath)) {
    console.error(`--pdf not found: ${pdfPath}`);
    process.exitCode = 1;
    return;
  }

  const ocr = await readOcrCache(argValue("--ocr"));
  const model = loadLLMConfig().models.crva_extraction.name;
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outDir = path.join(
    APP_DIR,
    "reports",
    "crva-eval",
    city,
    `agent-${variant.toLowerCase()}`,
    stamp,
  );
  await mkdir(outDir, { recursive: true });

  const all: RunStats[] = [];
  for (let run = 1; run <= runs; run++) {
    const { stats, warnings, bundle } = await runOnce({
      run,
      variant,
      pdfPath,
      ocr,
      model,
      maxTurns,
      timeoutMin,
    });
    await writeFile(
      path.join(outDir, `run-${run}.json`),
      JSON.stringify({ stats, warnings, bundle }, null, 2),
    );
    all.push(stats);
    console.log(
      `run ${run}: ${stats.status}${stats.error ? ` (${stats.error})` : ""}`,
    );
  }
  await writeFile(path.join(outDir, "runs.md"), runsTableMarkdown(all));
  console.log(`Wrote ${outDir}`);
  if (all.some((s) => s.status === "failed")) process.exitCode = 1;
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
