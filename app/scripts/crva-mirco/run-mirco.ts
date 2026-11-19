/**
 * Runs Mirco's pdf-extraction pipeline once on one CRVA report and saves the run in
 * the harness's run-file shape, so scripts/crva-eval/score-run.ts scores it unchanged.
 * Paid: OpenAI (and Mistral with --ocr-mode on). Never resubmits a job.
 *
 *   npx tsx scripts/crva-mirco/run-mirco.ts --city <slug> --pdf <report.pdf> \
 *     --ocr reports/crva-eval/<city>/ocr --mirco-dir <path to pdf-extraction> \
 *     --ocr-mode on|off [--base-url http://127.0.0.1:8080]
 *
 * Needs Mirco's service running (run-demo.cmd) with gpt-6.1-sol and medium effort,
 * and the inputs from scripts/crva-mirco/inputs.ts.
 * Output: app/reports/crva-eval/<city>/mirco-ocr-<on|off>/<timestamp>/ with
 * client.log (job ID), result.json (raw envelope), run-1.json and runs.md.
 */
import { spawn } from "node:child_process";
import { createWriteStream, existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { readOcrCache } from "../crva-eval/ocr-cache";
import { APP_DIR, runsTableMarkdown } from "../crva-eval/run-adapter";
import { redactSecrets } from "../crva-agent/run-stats";
import { assembleMircoBundle, mircoItems, mircoRunStats } from "./convert";

const MODEL = "gpt-6.1-sol";
const EFFORT = "medium";
/** Mirco's client cancels the job at its deadline; 1800 s (its default) can cut a long report. */
const CLIENT_TIMEOUT_S = 7200;
const MAX_REPAIRS = 3;

export function clientArgs(input: {
  mircoDir: string;
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
async function checkService(baseUrl: string, ocrOn: boolean) {
  const response = await fetch(`${baseUrl}/v1/config`).catch(() => {
    throw new Error(
      `Mirco's service is not reachable at ${baseUrl}; start run-demo.cmd first`,
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

async function main() {
  const city = argValue("--city");
  const pdf = path.resolve(argValue("--pdf"));
  const mircoDir = path.resolve(argValue("--mirco-dir"));
  const mode = argValue("--ocr-mode");
  const baseUrl = argValue("--base-url", "http://127.0.0.1:8080");
  if (mode !== "on" && mode !== "off")
    throw new Error("--ocr-mode must be on or off");
  const ocrOn = mode === "on";
  const inputs = path.join(APP_DIR, "reports", "crva-eval", "mirco-inputs");
  const schema = path.join(inputs, "crva-v0.schema.json");
  const userPrompt = path.join(inputs, "crva-user-prompt.md");
  const python = path.join(mircoDir, ".venv", "Scripts", "python.exe");
  for (const file of [pdf, schema, userPrompt, python]) {
    if (!existsSync(file)) throw new Error(`Not found: ${file}`);
  }
  const ocr = await readOcrCache(argValue("--ocr"));
  const config = await checkService(baseUrl, ocrOn);

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const outDir = path.join(
    APP_DIR,
    "reports",
    "crva-eval",
    city,
    `mirco-ocr-${mode}`,
    stamp,
  );
  await mkdir(outDir, { recursive: true });
  const resultPath = path.join(outDir, "result.json");
  const logPath = path.join(outDir, "client.log");

  const started = Date.now();
  const log = createWriteStream(logPath);
  const exitCode = await new Promise<number | null>((resolve, reject) => {
    const child = spawn(
      python,
      clientArgs({
        mircoDir,
        city,
        pdf,
        schema,
        userPrompt,
        ocrOn,
        output: resultPath,
        baseUrl,
      }),
      {
        cwd: mircoDir,
        stdio: ["ignore", "inherit", "pipe"],
      },
    );
    child.stderr.on("data", (chunk: Buffer) => {
      log.write(chunk);
      process.stderr.write(chunk);
    });
    child.on("error", reject);
    child.on("close", resolve);
  });
  await new Promise<void>((resolve) => log.end(resolve));
  const minutes = Math.round(((Date.now() - started) / 60_000) * 10) / 10;
  const jobId = parseJobId(await readFile(logPath, "utf8"));

  if (exitCode !== 0 || !existsSync(resultPath)) {
    console.error(
      `Client exited with ${exitCode}. Job ID: ${jobId ?? "none (not submitted)"}. ` +
        "Do not resubmit: recover with GET /v1/extractions/<id> and /result.",
    );
    process.exitCode = 1;
    return;
  }

  const envelope: unknown = JSON.parse(await readFile(resultPath, "utf8"));
  const { result, usage, repair } = (envelope ?? {}) as {
    result?: unknown;
    usage?: unknown;
    repair?: Record<string, unknown>;
  };
  const { items, badPointers } = mircoItems(result);
  const bundle =
    result == null
      ? null
      : assembleMircoBundle({
          file: ocr.file,
          items,
          badPointers,
          ocr,
          extractionModel: MODEL,
        });
  const stats = mircoRunStats({
    run: 1,
    envelope,
    bundle,
    minutes,
    ocr,
    ocrOn,
  });
  const { rounds: _rounds, ...repairSummary } = repair ?? {};
  await writeFile(
    path.join(outDir, "run-1.json"),
    JSON.stringify(
      {
        stats,
        warnings: [],
        bundle,
        mirco: {
          jobId,
          ocrOn,
          model: config.model,
          reasoningEffort: config.reasoning_effort,
          fingerprint: config.implementation_fingerprint,
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
