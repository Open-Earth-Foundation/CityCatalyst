/**
 * Scores one adapter run against the gold workbook.
 *
 *   npx tsx scripts/crva-eval/score-run.ts --gold <xlsx> --run <run-n.json> --city <slug> [--rejudge] [--seed 1285]
 *
 * Needs JUDGE_MODEL. Output goes to score-run-<n>/ next to the run file:
 * scored.csv, scored.json, judge.jsonl, review.csv and report.md.
 */
import { appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
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
import { reviewSample, scoreRun, sheetCsv } from "./score";
import type { Judgment } from "./types";

/** One line of judge.jsonl: a single judge call, successful or not. */
export interface JudgeLogLine {
  fieldId: string;
  attempt: number;
  ok: boolean;
  request: unknown;
  response: unknown;
  judgments?: Judgment[];
  error?: string;
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

function parseLog(text: string): JudgeLogLine[] {
  return text
    .split("\n")
    .filter((line) => line.trim())
    .map((line) => JSON.parse(line) as JudgeLogLine);
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
  const goldPath = argValue("--gold");
  const runPath = argValue("--run");
  const city = argValue("--city");
  const seed = Number(argValue("--seed", "1285"));
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
  const runNumber = path.basename(runPath).match(/run-(\d+)/)?.[1] ?? "1";
  const outDir = path.join(path.dirname(runPath), `score-run-${runNumber}`);
  await mkdir(outDir, { recursive: true });
  const logPath = path.join(outDir, "judge.jsonl");

  // A kept log means no LLM calls for fields it already judged.
  const cached = rejudge ? null : await readLog(logPath);
  if (rejudge) await writeFile(logPath, "");
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
          attempt,
          ok: false,
          request: null,
          response: null,
        };
        try {
          const result = await judgeField({
            client,
            model: judgeModel,
            fieldId,
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

  const rows = scoreRun({ gold, bundle, judgments });
  await writeFile(path.join(outDir, "scored.csv"), sheetCsv(rows));
  await writeFile(
    path.join(outDir, "scored.json"),
    JSON.stringify(rows, null, 2),
  );
  await writeFile(
    path.join(outDir, "review.csv"),
    sheetCsv(reviewSample(rows, seed)),
  );
  await writeFile(
    path.join(outDir, "report.md"),
    buildReport({
      city,
      rows,
      gold,
      stats,
      judgeModel,
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
