/**
 * Runs the pdf-extraction pipeline once on one CRVA report and saves the run in
 * the harness's run-file shape, so scripts/crva-eval/score-run.ts scores it unchanged.
 * Paid: OpenAI (and Mistral with --ocr-mode on). Never resubmits a job.
 *
 *   npx tsx scripts/crva-agentic-extraction/run-agentic.ts --city <slug> --pdf <report.pdf> \
 *     --ocr reports/crva-eval/<city>/ocr --pipeline-dir <path to pdf-extraction> \
 *     --ocr-mode on|off [--base-url http://127.0.0.1:8080]
 *
 * Recovery, no submission: add --result <saved /result JSON> [--job-id <id>]
 * [--minutes <wall time>] instead of --pipeline-dir to convert a result saved by hand.
 *
 * Needs the pdf-extraction service running (run-demo.cmd) with gpt-6.1-sol and medium effort,
 * and the inputs from scripts/crva-agentic-extraction/inputs.ts.
 * Output: app/reports/crva-eval/<city>/agentic-extraction-ocr-<on|off>/<timestamp>/ with
 * client.log (job ID), result.json (raw envelope), run-1.json and runs.md.
 */
import { spawn } from "node:child_process";
import { createWriteStream, existsSync } from "node:fs";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type { CrvaDraftBundle } from "@/backend/ingest/plugins/ccra/draft-schema";
import { readOcrCache, type OcrCache } from "../crva-eval/ocr-cache";
import {
  APP_DIR,
  runsTableMarkdown,
  type RunStats,
} from "../crva-eval/run-adapter";
import { redactSecrets } from "../crva-agent/run-stats";
import {
  assembleAgenticBundle,
  agenticItems,
  agenticRunStats,
} from "./convert";

export const MODEL = "gpt-6.1-sol";
const EFFORT = "medium";
/** The pdf-extraction client cancels the job at its deadline; 1800 s (its default) can cut a long report. */
const CLIENT_TIMEOUT_S = 7200;
const MAX_REPAIRS = 3;

export function clientArgs(input: {
  pipelineDir: string;
  city: string;
  pdf: string;
  schema: string;
  userPrompt: string;
  ocrOn: boolean;
  output: string;
  baseUrl: string;
}): string[] {
  return [
    "-m",
    "examples.extract",
    "--city",
    input.city,
    "--city-pdf",
    input.pdf,
    "--schema",
    input.schema,
    "--user-prompt-file",
    input.userPrompt,
    "--auto-repair",
    "--max-repairs",
    String(MAX_REPAIRS),
    "--timeout",
    String(CLIENT_TIMEOUT_S),
    "--output",
    input.output,
    "--base-url",
    input.baseUrl,
    ...(input.ocrOn ? ["--mistral-ocr"] : []),
  ];
}

export function parseJobId(log: string): string | null {
  return log.match(/Accepted job (\S+?);/)?.[1] ?? null;
}

function argValue(flag: string, fallback?: string): string {
  const i = process.argv.indexOf(flag);
  const value = i >= 0 ? process.argv[i + 1] : fallback;
  if (!value) throw new Error(`Missing ${flag}`);
  return value;
}

/** Stops before a paid call when the service is not set up as the spec requires. */
export async function checkService(baseUrl: string, ocrOn: boolean) {
  const response = await fetch(`${baseUrl}/v1/config`).catch(() => {
    throw new Error(
      `The pdf-extraction service is not reachable at ${baseUrl}; start run-demo.cmd first`,
    );
  });
  const config = (await response.json()) as {
    ready?: boolean;
    model?: string;
    reasoning_effort?: string;
    mistral_ocr_ready?: boolean;
    implementation_fingerprint?: string;
  };
  const problems = [
    !config.ready && "OPENAI_API_KEY is not set",
    config.model !== MODEL && `model is ${config.model}, expected ${MODEL}`,
    config.reasoning_effort !== EFFORT &&
      `effort is ${config.reasoning_effort}, expected ${EFFORT}`,
    ocrOn && !config.mistral_ocr_ready && "MISTRAL_API_KEY is not set",
  ].filter(Boolean);
  if (problems.length) throw new Error(`Service: ${problems.join("; ")}`);
  return config;
}

/** Null when the OCR cache was made from this PDF; else why the quote check would fail. */
export function ocrMismatch(pdf: string, ocr: OcrCache): string | null {
  const name = path.basename(pdf);
  return name === ocr.file
    ? null
    : `--ocr cache is for ${ocr.file}, not ${name}: every quote check would fail`;
}

/** What to do after the client failed; a missing job ID never proves nothing was submitted. */
export function failureNote(jobId: string | null): string {
  return jobId
    ? `Job ${jobId} was submitted. Do not resubmit: poll GET /v1/extractions/${jobId}, save /result, then convert it with --result.`
    : "No job ID in client.log, but the submission is uncertain: with OCR on, the server keeps working after the client's 600 s upload timeout. Check the service log and /v1/extractions before rerunning.";
}

/** Fresh and recovered runs share this, so a saved result converts the same way. */
export function convertEnvelope(input: {
  envelope: unknown;
  ocr: OcrCache;
  ocrOn: boolean;
  minutes: number;
}): {
  stats: RunStats;
  bundle: CrvaDraftBundle | null;
  ambiguousItems: number;
} {
  const { envelope, ocr, ocrOn, minutes } = input;
  const result = (envelope as { result?: unknown } | null)?.result;
  const { items, badPointers, ambiguousItems } = agenticItems(result);
  const bundle =
    result == null
      ? null
      : assembleAgenticBundle({
          file: ocr.file,
          items,
          badPointers,
          ocr,
          extractionModel: MODEL,
        });
  const stats = agenticRunStats({
    run: 1,
    envelope,
    bundle,
    minutes,
    ocr,
    ocrOn,
  });
  return { stats, bundle, ambiguousItems };
}

export async function runClient(input: {
  python: string;
  args: string[];
  cwd: string;
  logPath: string;
}): Promise<number | null> {
  const log = createWriteStream(input.logPath);
  const exitCode = await new Promise<number | null>((resolve, reject) => {
    const child = spawn(input.python, input.args, {
      cwd: input.cwd,
      stdio: ["ignore", "inherit", "pipe"],
    });
    child.stderr.on("data", (chunk: Buffer) => {
      log.write(chunk);
      process.stderr.write(chunk);
    });
    child.on("error", reject);
    child.on("close", resolve);
  });
  await new Promise<void>((resolve) => log.end(resolve));
  return exitCode;
}

async function main() {
  const city = argValue("--city");
  const pdf = path.resolve(argValue("--pdf"));
  const mode = argValue("--ocr-mode");
  if (mode !== "on" && mode !== "off")
    throw new Error("--ocr-mode must be on or off");
  const ocrOn = mode === "on";
  const ocr = await readOcrCache(argValue("--ocr"));
  const mismatch = ocrMismatch(pdf, ocr);
  if (mismatch) throw new Error(mismatch);
  // --result converts a result saved after a client failure; nothing is submitted.
  const savedResult = process.argv.includes("--result")
    ? path.resolve(argValue("--result"))
    : null;

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outDir = path.join(
    APP_DIR,
    "reports",
    "crva-eval",
    city,
    `agentic-extraction-ocr-${mode}`,
    stamp,
  );
  const resultPath = path.join(outDir, "result.json");
  let jobId: string | null;
  let minutes: number;
  let config: Awaited<ReturnType<typeof checkService>> | null = null;

  if (savedResult) {
    if (!existsSync(savedResult)) throw new Error(`Not found: ${savedResult}`);
    jobId = process.argv.includes("--job-id") ? argValue("--job-id") : null;
    minutes = Number(argValue("--minutes", "0"));
    await mkdir(outDir, { recursive: true });
    await copyFile(savedResult, resultPath);
  } else {
    const pipelineDir = path.resolve(argValue("--pipeline-dir"));
    const baseUrl = argValue("--base-url", "http://127.0.0.1:8080");
    const inputs = path.join(
      APP_DIR,
      "reports",
      "crva-eval",
      "agentic-extraction-inputs",
    );
    const schema = path.join(inputs, "crva-v0.schema.json");
    const userPrompt = path.join(inputs, "crva-user-prompt.md");
    const python = path.join(pipelineDir, ".venv", "Scripts", "python.exe");
    for (const file of [pdf, schema, userPrompt, python]) {
      if (!existsSync(file)) throw new Error(`Not found: ${file}`);
    }
    config = await checkService(baseUrl, ocrOn);
    await mkdir(outDir, { recursive: true });
    const logPath = path.join(outDir, "client.log");
    const started = Date.now();
    const exitCode = await runClient({
      python,
      args: clientArgs({
        pipelineDir,
        city,
        pdf,
        schema,
        userPrompt,
        ocrOn,
        output: resultPath,
        baseUrl,
      }),
      cwd: pipelineDir,
      logPath,
    });
    minutes = Math.round(((Date.now() - started) / 60_000) * 10) / 10;
    jobId = parseJobId(await readFile(logPath, "utf8"));
    if (exitCode !== 0 || !existsSync(resultPath)) {
      console.error(`Client exited with ${exitCode}. ${failureNote(jobId)}`);
      process.exitCode = 1;
      return;
    }
  }

  const envelope: unknown = JSON.parse(await readFile(resultPath, "utf8"));
  const { usage, repair } = (envelope ?? {}) as {
    usage?: unknown;
    repair?: Record<string, unknown>;
  };
  const { stats, bundle, ambiguousItems } = convertEnvelope({
    envelope,
    ocr,
    ocrOn,
    minutes,
  });
  const { rounds: _rounds, ...repairSummary } = repair ?? {};
  await writeFile(
    path.join(outDir, "run-1.json"),
    JSON.stringify(
      {
        stats,
        warnings: [],
        bundle,
        agentic: {
          jobId,
          ocrOn,
          recovered: savedResult !== null,
          model: config?.model ?? MODEL,
          reasoningEffort: config?.reasoning_effort ?? EFFORT,
          fingerprint: config?.implementation_fingerprint ?? null,
          ambiguousItems,
          usage,
          repair: repairSummary,
        },
      },
      null,
      2,
    ),
  );
  await writeFile(path.join(outDir, "runs.md"), runsTableMarkdown([stats]));
  console.log(
    `run 1: ${stats.status}${stats.error ? ` (${stats.error})` : ""}; job ${jobId}`,
  );
  console.log(`Wrote ${outDir}`);
  if (stats.status === "failed") process.exitCode = 1;
}

if (
  process.argv[1] &&
  pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url
) {
  main().catch((err) => {
    console.error(
      redactSecrets(
        err instanceof Error ? (err.stack ?? err.message) : String(err),
      ),
    );
    process.exitCode = 1;
  });
}
