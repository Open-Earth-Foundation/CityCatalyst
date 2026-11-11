/**
 * PDF extraction benchmark (CC-1124): runs selected cases through the real
 * import flow, scores them against the answer keys, compares each case with its
 * baseline and writes a run folder.
 *
 *   npx tsx scripts/pdf-benchmark.ts --cases C-004,C-010
 *   npx tsx scripts/pdf-benchmark.ts --list
 *
 * Exit codes: 0 ok, 1 regression or error, 2 configuration or selection error,
 * 130 interrupted.
 */
import env from "@next/env";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import {
  loadAnswerKeys,
  type KeyFile,
} from "@/backend/ingestion-benchmark/answer-keys";
import {
  caseTestSetVersion,
  combinedTestSetVersion,
  compareWithBaseline,
  loadBaseline,
  runnerFailedCases,
  saveBaseline,
  updateBaseline,
  type Baseline,
  type BaselineEntry,
} from "@/backend/ingestion-benchmark/baseline";
import {
  exitCode,
  forecastUsd,
  gateAgainstBaseline,
  type CaseGate,
} from "@/backend/ingestion-benchmark/gate";
import {
  blockSummaries,
  caseVerdict,
  type CaseVerdict,
} from "@/backend/ingestion-benchmark/metrics";
import {
  logBenchmarkRun,
  mlflowConfigFromEnv,
} from "@/backend/ingestion-benchmark/mlflow";
import {
  adaptLegacySummary,
  type LegacySummary,
} from "@/backend/ingestion-benchmark/legacy-results";
import { rescoreCase } from "@/backend/ingestion-benchmark/rescore";
import {
  ZERO_TOKENS,
  appendIndexLine,
  caseMetrics,
  gitInfo,
  renderIndexLine,
  runFolderName,
  writeRunArtifact,
  type Block,
  type CaseResult,
  type Prices,
  type RunEntry,
  type RunSummary,
} from "@/backend/ingestion-benchmark/report";
import {
  MAX_FILES_PER_RUN,
  SelectionError,
  loadManifest,
  selectCases,
  type CaseManifestEntry,
} from "@/backend/ingestion-benchmark/selection";
import { parseArgs, type CliOptions } from "./pdf-benchmark/args";
import type { LocalConfig } from "./pdf-benchmark/run-case";

const MANIFEST_PATH = "benchmarks/pdf/cases.json";
const PRICES_PATH = "benchmarks/pdf/prices.json";
const BASELINE_PATH = "benchmarks/pdf/baseline.json";
const DEFAULT_OUT_ROOT = "../docs/ingestion-accuracy-runs";

class ConfigError extends Error {}

const money = (value: number | null) =>
  value === null ? "n/a" : `$${value.toFixed(value < 1 ? 3 : 2)}`;
const minutes = (seconds: number | null) =>
  seconds === null ? "n/a" : `${Math.round(seconds / 60)} min`;

function readJson<T>(path: string, what: string): T {
  if (!existsSync(path)) throw new ConfigError(`${what} not found: ${path}`);
  try {
    return JSON.parse(readFileSync(path, "utf8")) as T;
  } catch (error) {
    throw new ConfigError(`${what} is not valid JSON (${path}): ${error}`);
  }
}

function loadConfig(path: string, needPdfDir = true): LocalConfig {
  const raw = readJson<Partial<LocalConfig>>(path, "Local config");
  if ((needPdfDir && !raw.pdfDir) || !raw.answerKeys) {
    throw new ConfigError(
      `Local config ${path} needs ${needPdfDir ? '"pdfDir" and ' : ""}"answerKeys" (see benchmarks/pdf/config.example.json)`,
    );
  }
  return { ...raw, outRoot: raw.outRoot ?? DEFAULT_OUT_ROOT } as LocalConfig;
}

function dirty(): boolean {
  try {
    return (
      execFileSync("git", ["status", "--porcelain", "--untracked-files=no"], {
        encoding: "utf8",
      }).trim() !== ""
    );
  } catch {
    return false;
  }
}

/** The stored result of a case in the run its baseline entry points at. */
function baselineResult(
  baseline: Baseline,
  outRoot: string,
  id: string,
): CaseResult | null {
  const entry = baseline[id];
  if (!entry) return null;
  try {
    const file = join(outRoot, entry.runFolder, "results.json");
    if (!existsSync(file)) return null;
    const summary = JSON.parse(readFileSync(file, "utf8")) as RunSummary;
    return summary.results.find((result) => result.id === id) ?? null;
  } catch {
    return null;
  }
}

/** Cost and time of `runs` attempts at the baseline's usage; null where there is no baseline. */
function forecastRun(
  before: CaseResult | null,
  prices: Prices | undefined,
  runs: number,
): { usd: number | null; seconds: number | null } {
  if (!before || before.runs.length === 0) return { usd: null, seconds: null };
  const scale = runs / before.runs.length;
  const usd = forecastUsd(before, prices, runs);
  const seconds =
    (before.runs.reduce((sum, run) => sum + run.stageMs.total, 0) / 1000) *
    scale;
  return { usd, seconds };
}

function printList(
  manifest: CaseManifestEntry[],
  baseline: Baseline,
  outRoot: string,
  prices: Prices | undefined,
) {
  console.log("id\tcity\tyear\tblock\teligible\tbaseline\tforecast (3 runs)");
  for (const entry of manifest) {
    const eligible = entry.textTables === true && !entry.totalOnly;
    const date = baseline[entry.id]?.date.slice(0, 10) ?? "none";
    const { usd } = forecastRun(
      baselineResult(baseline, outRoot, entry.id),
      prices,
      3,
    );
    console.log(
      `${entry.id}\t${entry.city}\t${entry.year}\t${entry.block}\t${eligible ? "yes" : "no"}\t${date}\t${money(usd)}`,
    );
  }
  console.log(`${manifest.length} cases`);
}

function missingInputs(
  selected: CaseManifestEntry[],
  config: LocalConfig,
  keys: Record<string, KeyFile>,
  pdfPathFor: (config: LocalConfig, entry: CaseManifestEntry) => string | null,
): string[] {
  const missing: string[] = [];
  for (const entry of selected) {
    if (!pdfPathFor(config, entry)) {
      missing.push(`${entry.id}: PDF "${entry.fileName}" not found in pdfDir`);
    }
    if (!keys[entry.id]) {
      missing.push(
        `${entry.id}: no answer key in ${basename(config.answerKeys)}`,
      );
    }
  }
  return missing;
}

/**
 * Rescores the stored values of an earlier run with the current scorer and
 * answer keys. Needs no database, LLM, OCR or PDF, and never touches the
 * baseline.
 */
async function rescoreRun(options: CliOptions): Promise<number> {
  let config: LocalConfig;
  let manifest: CaseManifestEntry[];
  let keys: Record<string, KeyFile>;
  let allPrices: Record<string, Prices>;
  let old: LegacySummary;
  try {
    config = loadConfig(resolve(options.configPath), false);
    manifest = loadManifest(MANIFEST_PATH);
    keys = loadAnswerKeys(config.answerKeys);
    allPrices = readJson<Record<string, Prices>>(PRICES_PATH, "Prices file");
    old = readJson<LegacySummary>(resolve(options.rescore!), "Results file");
    if (!Array.isArray(old.results)) {
      throw new ConfigError(
        `Results file has no "results": ${options.rescore}`,
      );
    }
  } catch (error) {
    console.error((error as Error).message);
    return 2;
  }
  const outRoot = resolve(config.outRoot);
  const before = adaptLegacySummary(old, manifest).filter(
    (result) =>
      keys[result.id] &&
      manifest.some((e) => e.id.toLowerCase() === result.id.toLowerCase()),
  );
  const missingKeys = old.results
    .map((result) => result.id)
    .filter((id) => !before.some((result) => result.id === id));
  if (missingKeys.length) {
    console.warn(
      `No answer key or manifest entry for ${missingKeys.join(", ")}: left out of the rescore`,
    );
  }
  const results = before.map((result) => rescoreCase(result, keys[result.id]));
  const extractionModel = old.extractionModel ?? old.llmModel;
  const prices =
    old.prices ?? (extractionModel ? allPrices[extractionModel] : undefined);

  const caseVersions = results.map((result) =>
    caseTestSetVersion(
      manifest.find((e) => e.id.toLowerCase() === result.id.toLowerCase())!,
      keys[result.id],
    ),
  );
  const verdicts = results.map((result) =>
    caseVerdict(result, keys[result.id], prices),
  );
  const manifestCounts = (["validated", "held-out", "dev"] as Block[]).reduce(
    (acc, block) => ({
      ...acc,
      [block]: manifest.filter((entry) => entry.block === block).length,
    }),
    {} as Record<Block, number>,
  );
  const blocks = blockSummaries(verdicts, manifestCounts);
  const summary: RunSummary = {
    measuredAt: new Date().toISOString(),
    ...gitInfo(),
    llmModel: old.llmModel,
    extractionModel: old.extractionModel,
    reasoningEffort: old.reasoningEffort,
    ocrModel: old.ocrModel,
    prices,
    runsPerFile: old.runsPerFile ?? 3,
    heldOut: old.heldOut,
    results,
    selection: results.map((result) => result.id),
    exploratory: (old.runsPerFile ?? 3) !== 3,
    interrupted: false,
    promptHash: old.promptHash ?? null,
    inputRepresentation: old.inputRepresentation ?? null,
    testSetVersion: combinedTestSetVersion(caseVersions),
    dirty: dirty(),
    mlflowRunUrl: null,
    mlflowNote: "not logged (rescore)",
    rescoredFrom: { measuredAt: old.measuredAt, commit: old.commit },
  };
  const runFolder = writeRunArtifact({
    outRoot,
    summary,
    verdicts,
    blocks,
    gates: [],
  });
  appendIndexLine(
    join(outRoot, "INDEX.md"),
    renderIndexLine(
      summary,
      blocks,
      runFolderName(summary.measuredAt, summary.commit),
    ),
  );

  const pct = (value: number | null) =>
    value === null ? "n/a" : `${Math.round(value * 100)}%`;
  console.log("case\trecall old -> new\tvalue accuracy old -> new");
  before.forEach((result, index) => {
    const was = caseMetrics(result);
    const now = caseMetrics(results[index]);
    console.log(
      `${result.id}\t${pct(was.rowRecall)} -> ${pct(now.rowRecall)}\t${pct(was.valueAccuracy)} -> ${pct(now.valueAccuracy)}`,
    );
  });
  console.log(`Rescore folder: ${runFolder}`);
  return 0;
}

export async function main(argv: string[]): Promise<number> {
  let options: CliOptions;
  try {
    options = parseArgs(argv);
  } catch (error) {
    console.error((error as Error).message);
    return 2;
  }

  if (options.rescore) return rescoreRun(options);

  // Environment first: product modules read it when they load.
  env.loadEnvConfig(process.cwd());

  let config: LocalConfig;
  let manifest: CaseManifestEntry[];
  let keys: Record<string, KeyFile>;
  let baseline: Baseline;
  let allPrices: Record<string, Prices>;
  try {
    config = loadConfig(resolve(options.configPath));
    manifest = loadManifest(MANIFEST_PATH);
    keys = loadAnswerKeys(config.answerKeys);
    baseline = loadBaseline(BASELINE_PATH);
    allPrices = readJson<Record<string, Prices>>(PRICES_PATH, "Prices file");
  } catch (error) {
    console.error((error as Error).message);
    return 2;
  }
  const outRoot = resolve(config.outRoot);
  const extractionModel =
    process.env.LLM_EXTRACTION_MODEL || process.env.LLM_MODEL;
  const prices = extractionModel ? allPrices[extractionModel] : undefined;

  if (options.list) {
    printList(manifest, baseline, outRoot, prices);
    return 0;
  }

  let selected: CaseManifestEntry[];
  try {
    selected = selectCases(manifest, options);
  } catch (error) {
    if (error instanceof SelectionError) {
      console.error(error.message);
      if (error.message.includes("exceed")) {
        console.error(
          `A run takes at most ${MAX_FILES_PER_RUN} files; split the selection into several runs.`,
        );
      }
      return 2;
    }
    throw error;
  }

  const { createContext, disposeContext, pdfPathFor, runAttempt } =
    await import("./pdf-benchmark/run-case");
  const missing = missingInputs(selected, config, keys, pdfPathFor);
  if (missing.length) {
    console.error(
      `Missing inputs:\n${missing.map((m) => `  ${m}`).join("\n")}`,
    );
    return 2;
  }

  const forecasts = selected.map((entry) => ({
    entry,
    ...forecastRun(
      baselineResult(baseline, outRoot, entry.id),
      prices,
      options.runs,
    ),
  }));
  const forecastTotal = forecasts.every((f) => f.usd !== null)
    ? forecasts.reduce((sum, f) => sum + (f.usd ?? 0), 0)
    : null;
  const forecastSeconds = forecasts.every((f) => f.seconds !== null)
    ? forecasts.reduce((sum, f) => sum + (f.seconds ?? 0), 0)
    : null;
  console.log(
    `Selected ${selected.length} case(s) x ${options.runs} attempt(s): ${selected.map((c) => c.id).join(", ")}`,
  );
  console.log(
    `Forecast: ${money(forecastTotal)}, about ${minutes(forecastSeconds)} (from the baseline usage; model ${extractionModel ?? "unknown"}${prices ? "" : ", no prices for this model"})`,
  );
  if (options.dryRun) return 0;

  const { promptHash } = await import("./pdf-benchmark/prompt-hash");
  const before = new Set(process.listeners("SIGINT"));
  const ctx = await createContext(config);
  let interrupted = false;
  const onSigint = () => {
    if (interrupted) {
      console.error(
        "Second interrupt: cleaning up (up to 15 s), then exiting.",
      );
      void Promise.race([
        disposeContext(ctx).catch(() => undefined),
        new Promise((resolve) => setTimeout(resolve, 15_000)),
      ]).then(() => {
        if (!ctx.cleanedUp) {
          console.error(
            `Cleanup incomplete. Leftover test city ids: ${ctx.cityIds.join(", ")}`,
          );
        }
        process.exit(130);
      });
      return;
    }
    interrupted = true;
    console.error(
      "Interrupt received: finishing the current attempt, then writing a partial report.",
    );
  };
  // createContext loads app modules; @highlight-run/node then registers a
  // SIGINT handler that flushes and calls process.exit(), which would kill the
  // run mid-attempt and skip cleanup. Drop only listeners the app added, so
  // tsx keeps its own relay listener.
  for (const listener of process.listeners("SIGINT")) {
    if (!before.has(listener)) process.off("SIGINT", listener);
  }
  process.on("SIGINT", onSigint);
  // Windows delivers Ctrl+Break (and a closed console) as SIGBREAK.
  process.on("SIGBREAK", onSigint);

  const measuredAt = new Date().toISOString();
  const results: CaseResult[] = [];
  try {
    attempts: for (const entry of selected) {
      const key = keys[entry.id];
      const runs: RunEntry[] = [];
      for (let attempt = 1; attempt <= options.runs; attempt++) {
        if (interrupted) break;
        console.log(`[${entry.id}] attempt ${attempt}/${options.runs}`);
        const run = await runAttempt(ctx, entry, key, attempt);
        console.log(
          `[${entry.id}] attempt ${attempt}: ${run.failureMode}${run.message ? ` (${run.message})` : ""}`,
        );
        runs.push(run);
      }
      if (runs.length > 0) {
        const ocrRuns = ctx.ocrRuns.get(entry.id) ?? [];
        const totals = runs
          .filter((run) => run.ok)
          .map((run) => Math.round(run.total ?? 0));
        results.push({
          id: entry.id,
          file: entry.fileName,
          kind: "pdf",
          targetYear: entry.year,
          keyId: key.id,
          ocr: {
            ok: ocrRuns.every((ocr) => ocr.ok),
            code: ocrRuns.find((ocr) => ocr.code)?.code ?? null,
          },
          productFlowFailsAtOcr: ocrRuns.some(
            (ocr) => !ocr.ok && ocr.code != null,
          ),
          runs,
          stableTotal: totals.length > 1 && new Set(totals).size === 1,
          block: entry.block,
          eligible: entry.totalOnly ? null : entry.textTables === true,
          totalOnly: entry.totalOnly,
          textTables: entry.textTables,
          ocrUsage: {
            ...ZERO_TOKENS,
            pages:
              ocrRuns.length > 0 && ocrRuns.every((ocr) => ocr.pages != null)
                ? ocrRuns.reduce((sum, ocr) => sum + (ocr.pages ?? 0), 0)
                : null,
          },
        });
      }
      if (interrupted) break attempts;
    }

    const caseVersions = new Map(
      results.map((result) => [
        result.id,
        caseTestSetVersion(
          selected.find((entry) => entry.id === result.id)!,
          keys[result.id],
        ),
      ]),
    );
    const verdicts: CaseVerdict[] = results.map((result) =>
      caseVerdict(result, keys[result.id], prices),
    );
    const gates: CaseGate[] = verdicts.map((verdict) => {
      const before = baselineResult(baseline, outRoot, verdict.id);
      const comparison = compareWithBaseline({
        id: verdict.id,
        current: verdict,
        currentVersion: caseVersions.get(verdict.id)!,
        baseline,
        key: keys[verdict.id],
        runsRoot: outRoot,
        prices,
      });
      return gateAgainstBaseline(
        verdict,
        comparison,
        before ? forecastUsd(before, prices, verdict.attempts) : null,
      );
    });
    const manifestCounts = (["validated", "held-out", "dev"] as Block[]).reduce(
      (acc, block) => ({
        ...acc,
        [block]: manifest.filter((entry) => entry.block === block).length,
      }),
      {} as Record<Block, number>,
    );
    const blocks = blockSummaries(verdicts, manifestCounts);

    const git = gitInfo();
    const folderName = runFolderName(measuredAt, git.commit);
    const baselineEntries: Record<string, BaselineEntry> = Object.fromEntries(
      verdicts.map((verdict) => [
        verdict.id,
        {
          verdict,
          commit: git.commit,
          extractionModel: extractionModel ?? null,
          ocrModel: process.env.MISTRAL_OCR_MODEL || "mistral-ocr-latest",
          promptHash: promptHash(),
          testSetVersion: caseVersions.get(verdict.id)!,
          runFolder: folderName,
          date: measuredAt,
        },
      ]),
    );
    const baselineNotRecorded =
      options.updateBaseline && options.runs === 3 && !interrupted
        ? runnerFailedCases(baselineEntries)
        : [];
    const summary: RunSummary = {
      measuredAt,
      ...git,
      llmModel: process.env.LLM_MODEL,
      extractionModel,
      reasoningEffort: process.env.LLM_EXTRACTION_REASONING_EFFORT || null,
      ocrModel: process.env.MISTRAL_OCR_MODEL || "mistral-ocr-latest",
      prices,
      runsPerFile: options.runs,
      heldOut: manifest.filter((e) => e.block === "held-out").map((e) => e.id),
      results,
      selection: selected.map((entry) => entry.id),
      exploratory: options.runs !== 3,
      interrupted,
      promptHash: promptHash(),
      inputRepresentation:
        process.env.PDF_BENCHMARK_INPUT_REPRESENTATION ?? "ocr-markdown",
      testSetVersion: combinedTestSetVersion([...caseVersions.values()]),
      dirty: dirty(),
      mlflowRunUrl: null,
      mlflowNote: null,
      ...(baselineNotRecorded.length ? { baselineNotRecorded } : {}),
    };

    const runFolder = writeRunArtifact({
      outRoot,
      summary,
      verdicts,
      blocks,
      gates,
    });

    const mlflowConfig = mlflowConfigFromEnv(process.env, options.noMlflow);
    if (!mlflowConfig) {
      summary.mlflowNote = options.noMlflow
        ? "MLflow skipped (--no-mlflow)"
        : "MLflow not configured";
    } else {
      const logged = await logBenchmarkRun({
        config: mlflowConfig,
        summary,
        verdicts,
        blocks,
        runFolder,
      });
      if (logged.logged) summary.mlflowRunUrl = logged.runUrl;
      else summary.mlflowNote = `MLflow logging failed: ${logged.reason}`;
    }
    // Rewrite so the report carries the MLflow URL or note.
    writeRunArtifact({ outRoot, summary, verdicts, blocks, gates });

    // OCR text is third-party document text: written locally only, git-ignored.
    for (const [attemptKey, text] of ctx.ocrTexts) {
      const [caseId, attempt] = attemptKey.split("/");
      const dir = join(runFolder, "cases", caseId, `attempt-${attempt}`);
      mkdirSync(dir, { recursive: true });
      writeFileSync(join(dir, "ocr.md"), text);
    }

    appendIndexLine(
      join(outRoot, "INDEX.md"),
      renderIndexLine(summary, blocks, folderName),
    );

    if (options.updateBaseline) {
      const updated = updateBaseline({
        baseline,
        entries: baselineEntries,
        exploratory: summary.exploratory,
        interrupted,
      });
      if (updated !== baseline) {
        saveBaseline(BASELINE_PATH, updated);
        console.log(`Baseline updated: ${BASELINE_PATH}`);
      } else {
        console.log("Baseline not updated (exploratory or interrupted run).");
      }
      for (const skipped of baselineNotRecorded) {
        console.log(
          `Not recorded in the baseline: ${skipped.id} (${skipped.modes.join(", ")})`,
        );
      }
    }

    console.log("");
    for (const gate of gates) {
      console.log(
        `${gate.id}: ${gate.verdict}${gate.reasons.length ? ` (${gate.reasons.join("; ")})` : ""}`,
      );
    }
    for (const block of blocks) {
      console.log(
        `${block.block}: headline recall ${block.headlineRecall === null ? "n/a" : `${Math.round(block.headlineRecall * 100)}%`} over ${block.casesInRun} case(s)`,
      );
    }
    if (interrupted) console.log("INTERRUPTED: partial report written.");
    console.log(`Run folder: ${runFolder}`);
    return interrupted ? 130 : exitCode(gates);
  } finally {
    process.off("SIGINT", onSigint);
    process.off("SIGBREAK", onSigint);
    await disposeContext(ctx);
  }
}

main(process.argv.slice(2)).then(
  (code) => process.exit(code),
  (error) => {
    console.error(error);
    process.exit(1);
  },
);
