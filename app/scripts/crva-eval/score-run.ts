/**
 * Scores one adapter run against the gold workbook.
 *
 *   npx tsx scripts/crva-eval/score-run.ts --gold <xlsx> --run <run-n.json> --city <slug> [--rejudge] [--seed 1285]
 *
 * Needs JUDGE_MODEL. Refuses a gold file whose page count differs from the
 * run's. Output goes to score-run-<n>/ next to the run file: scored.csv,
 * scored.json, judge.jsonl, review.csv and report.md. Fields already in
 * judge.jsonl are reused; --rejudge renames it to judge.<timestamp>.jsonl first.
 */
import {
  appendFile,
  mkdir,
  readFile,
  rename,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import env from "@next/env";
import { getLlmChunkConcurrency, mapPool } from "@/backend/asyncPool";
import {
  CRVA_FIELD_IDS,
  type CrvaDraftBundle,
} from "@/backend/ingest/plugins/ccra/draft-schema";
import { createLLMClient, loadLLMConfig } from "@/backend/llm";
import { readGoldWorkbook } from "./gold";
import { JudgeCallError, judgeClientConfig, judgeField } from "./judge";
import { buildReport } from "./report";
import type { RunStats } from "./run-adapter";
import { reviewCsv, reviewSample, scoreRun, sheetCsv } from "./score";
import { goldFieldId, type GoldWorkbook, type Judgment } from "./types";

/** One line of judge.jsonl: a single judge call, successful or not. */
export interface JudgeLogLine {
  fieldId: string;
  /** The judge model of this call, so a cached run reports the right one. */
  model: string;
  attempt: number;
  ok: boolean;
  request: unknown;
  response: unknown;
  judgments?: Judgment[];
  error?: string;
}

/**
 * Judges one adapter field. The gold answer key may use another id for the
 * same requirement, so the judge sees the gold id while the values stay the
 * adapter's; the caller stores the result under the adapter id.
 */
export function judgeAdapterField(
  input: Omit<Parameters<typeof judgeField>[0], "fieldId"> & {
    adapterFieldId: string;
  },
) {
  const { adapterFieldId, ...rest } = input;
  return judgeField({ ...rest, fieldId: goldFieldId(adapterFieldId) });
}

/** Rebuilds judgments from the last ok line of each field. */
export function judgmentsFromLog(
  lines: JudgeLogLine[],
): Record<string, Judgment[]> {
  const result: Record<string, Judgment[]> = {};
  for (const line of lines) {
    if (line.ok && line.judgments) result[line.fieldId] = line.judgments;
  }
  return result;
}

/** Models of the lines that produced the used judgments (last ok line per field). */
export function modelsFromLog(lines: JudgeLogLine[]): string[] {
  const last = new Map<string, string>();
  for (const line of lines) {
    if (line.ok && line.judgments) {
      last.set(line.fieldId, line.model ?? "unknown");
    }
  }
  return [...new Set(last.values())];
}

/** A half-written last line (interrupted run) is skipped; an earlier bad line is an error. */
export function parseLog(text: string): JudgeLogLine[] {
  const raw = text.split("\n").filter((line) => line.trim());
  const lines: JudgeLogLine[] = [];
  raw.forEach((line, i) => {
    try {
      lines.push(JSON.parse(line) as JudgeLogLine);
    } catch (err) {
      if (i < raw.length - 1) throw err;
      console.warn("judge.jsonl: skipping unparsable last line");
    }
  });
  return lines;
}

/** The scanned copy of a PDF carries an `_escaneado` suffix; same document. */
function pdfName(name: string): string {
  return name
    .toLowerCase()
    .replace(/\.pdf$/, "")
    .replace(/_escaneado$/, "");
}

/** A gold file for another PDF would score every row wrong, so catch it early. */
export function checkGoldMatchesRun(
  gold: Pick<GoldWorkbook, "pdfFileName" | "pageCount">,
  bundle: Pick<CrvaDraftBundle, "file" | "pageCount">,
): { error?: string; warning?: string } {
  if (gold.pageCount !== bundle.pageCount) {
    return {
      error: `gold has ${gold.pageCount} pages, run has ${bundle.pageCount}: wrong gold file?`,
    };
  }
  if (pdfName(gold.pdfFileName) !== pdfName(bundle.file)) {
    return {
      warning: `gold is for "${gold.pdfFileName}", run is for "${bundle.file}"`,
    };
  }
  return {};
}

/** Moves an existing judge log aside so --rejudge never loses the judgments it replaces. */
export async function backupJudgeLog(
  logPath: string,
  now = new Date(),
): Promise<string | null> {
  const stamp = now.toISOString().replace(/[:.]/g, "-");
  const backup = path.join(path.dirname(logPath), `judge.${stamp}.jsonl`);
  try {
    await rename(logPath, backup);
    return backup;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
}

function argValue(flag: string, fallback?: string): string {
  const i = process.argv.indexOf(flag);
  const value = i >= 0 ? process.argv[i + 1] : fallback;
  if (!value) throw new Error(`Missing ${flag}`);
  return value;
}

async function readLog(file: string): Promise<JudgeLogLine[] | null> {
  try {
    return parseLog(await readFile(file, "utf8"));
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
}

async function main() {
  env.loadEnvConfig(process.cwd());
  const judgeModel = process.env.JUDGE_MODEL;
  if (!judgeModel) {
    console.error("JUDGE_MODEL is not set");
    process.exitCode = 1;
    return;
  }
  const seed = Number(argValue("--seed", "1285"));
  if (!Number.isInteger(seed)) {
    console.error("--seed must be an integer");
    process.exitCode = 1;
    return;
  }
  const goldPath = argValue("--gold");
  const runPath = argValue("--run");
  const city = argValue("--city");
  const rejudge = process.argv.includes("--rejudge");

  const run = JSON.parse(await readFile(runPath, "utf8")) as {
    stats: RunStats;
    bundle: CrvaDraftBundle | null;
  };
  const { bundle, stats } = run;
  if (!bundle) {
    console.error(
      `${runPath} is a failed run (${stats.error ?? "no bundle"}); nothing scored.`,
    );
    process.exitCode = 1;
    return;
  }

  const gold = await readGoldWorkbook(goldPath);
  const check = checkGoldMatchesRun(gold, bundle);
  if (check.error) {
    console.error(check.error);
    process.exitCode = 1;
    return;
  }
  if (check.warning) console.warn(`Warning: ${check.warning}`);
  const runNumber = path.basename(runPath).match(/run-(\d+)/)?.[1] ?? "1";
  const outDir = path.join(path.dirname(runPath), `score-run-${runNumber}`);
  await mkdir(outDir, { recursive: true });
  const logPath = path.join(outDir, "judge.jsonl");

  // A kept log means no LLM calls for fields it already judged.
  if (rejudge) {
    const backup = await backupJudgeLog(logPath);
    if (backup) console.log(`Previous judge log kept as ${backup}`);
  }
  const cached = rejudge ? null : await readLog(logPath);
  const judgments = judgmentsFromLog(cached ?? []);

  const toJudge = CRVA_FIELD_IDS.filter(
    (id) => !judgments[id] && bundle.values.some((v) => v.fieldId === id),
  );
  const failedFields: string[] = [];
  if (toJudge.length > 0) {
    const client = createLLMClient(
      judgeClientConfig(loadLLMConfig(), judgeModel),
    );
    await mapPool(toJudge, getLlmChunkConcurrency(), async (fieldId) => {
      for (let attempt = 1; attempt <= 2; attempt++) {
        const line: JudgeLogLine = {
          fieldId,
          model: judgeModel,
          attempt,
          ok: false,
          request: null,
          response: null,
        };
        try {
          const result = await judgeAdapterField({
            client,
            model: judgeModel,
            adapterFieldId: fieldId,
            goldRows: gold.rows,
            values: bundle.values.filter((v) => v.fieldId === fieldId),
            figures: bundle.figures,
          });
          Object.assign(line, { ok: true, ...result });
          judgments[fieldId] = result.judgments;
        } catch (err) {
          line.error = err instanceof Error ? err.message : String(err);
          if (err instanceof JudgeCallError) {
            line.request = err.request;
            line.response = err.response;
          }
          console.error(`judge ${fieldId} attempt ${attempt}: ${line.error}`);
        }
        await appendFile(logPath, JSON.stringify(line) + "\n");
        if (line.ok) return;
      }
      failedFields.push(fieldId);
    });
  }

  // Read the log back so freshly judged fields count too.
  const judgeModels = modelsFromLog((await readLog(logPath)) ?? []);
  const rows = scoreRun({ gold, bundle, judgments });
  await writeFile(path.join(outDir, "scored.csv"), sheetCsv(rows));
  await writeFile(
    path.join(outDir, "scored.json"),
    JSON.stringify(rows, null, 2),
  );
  await writeFile(
    path.join(outDir, "review.csv"),
    reviewCsv(reviewSample(rows, seed)),
  );
  await writeFile(
    path.join(outDir, "report.md"),
    buildReport({
      city,
      rows,
      gold,
      stats,
      judgeModel,
      judgeModels,
      extractionModel: bundle.extractionModel,
      failedFields,
    }),
  );
  console.log(`Wrote ${outDir}`);
  if (failedFields.length > 0) {
    console.error(`Fields not judged: ${failedFields.join(", ")}`);
  }
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
