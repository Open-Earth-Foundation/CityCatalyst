/**
 * Runs the pdf-extraction pipeline plus our reference pass for A1.2a (references.ts) and saves
 * one harness run folder that scripts/crva-eval/score-run.ts scores unchanged.
 * Paid: OpenAI (the agent job(s) and the reference mapping). Never resubmits a job.
 *
 * Default (vote 2/3, 2026-11-20): three single jobs in parallel, each converted on
 * its own, then combined by combine.ts vote 2 of 3 (part-<k>.json keeps each run).
 * --runs 1 runs one job (waves 2.5-2.7); --combine union (2 or 3 runs) is for
 * experiments. Each single job uses the full 12-field schema and prompt from
 * inputs.ts, unchanged from wave 1.5. A1.2a: the reference pass plus the job's own
 * A1.2a items no reference item covers (--reference-mode union, wave 2.6), or the
 * reference pass only (replace, wave 2.5). The C1 split rules (inputs.ts
 * PromptOptions.c1Split) are on by default; --no-c1-split gives the wave 2.6 prompt.
 * --groups (wave 2): five jobs, one per field group (groups.ts), in parallel; the
 * A1 job keeps A1.2a for non-reference sources, and E1 adds risk table rows.
 *
 *   npx tsx scripts/crva-agentic-extraction/run-agentic-refs.ts --city <slug> --pdf <report.pdf> \
 *     --ocr reports/crva-eval/<city>/ocr --pipeline-dir <path to pdf-extraction> \
 *     [--runs 1-5] [--combine vote|union] [--groups]
 *     [--reference-mode union|replace] [--no-c1-split] [--base-url http://127.0.0.1:8080] [--reference-model gpt-5.6-luna]
 *
 * Recovery, no new jobs: --results-dir <run folder> converts the result-<job>.json
 * files there again (after a usage refresh, say), reusing its references.json.
 *
 * Needs the pdf-extraction service running with gpt-6.1-sol and medium effort (OCR off), and
 * OPENAI_API_KEY in app/.env for the reference mapping (LLM_BASE_URL="").
 * Output: app/reports/crva-eval/<city>/agentic-extraction-refs/<timestamp>/ (agentic-extraction-groups/ with
 * --groups) with inputs/<job>.schema.json and .md, client-<job>.log,
 * result-<job>.json, references.json, run-1.json and runs.md. Job IDs are printed;
 * delete the jobs with DELETE /v1/extractions/<id> once their usage is saved.
 */
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import env from "@next/env";
import { createLLMClient, loadLLMConfig } from "@/backend/llm";
import { readOcrCache } from "../crva-eval/ocr-cache";
import { judgeClientConfig } from "../crva-eval/judge";
import { APP_DIR, runsTableMarkdown } from "../crva-eval/run-adapter";
import { redactSecrets } from "../crva-agent/run-stats";
import {
  assembleAgenticBundle,
  mergeEnvelopes,
  mergeGroupResults,
  agenticRunStats,
  unionReferenceItems,
  withReferenceItems,
} from "./convert";
import { CRVA_GROUPS, groupJsonSchema, groupUserPrompt } from "./groups";
import { combineRuns } from "./combine";
import { crvaJsonSchema, crvaUserPrompt } from "./inputs";

const SINGLE = "single";
import {
  REFERENCE_ANSWER_SCHEMA,
  captionSources,
  findReferenceEntries,
  mapReferences,
  referenceItems,
  referencePrompt,
  type MappedReference,
  type ReferenceEntry,
} from "./references";
import {
  MODEL,
  checkService,
  clientArgs,
  failureNote,
  ocrMismatch,
  parseJobId,
  runClient,
} from "./run-agentic";

function argValue(flag: string, fallback?: string): string {
  const i = process.argv.indexOf(flag);
  const value = i >= 0 ? process.argv[i + 1] : fallback;
  if (!value) throw new Error(`Missing ${flag}`);
  return value;
}

export interface RunPlan {
  runs: number;
  combine: "none" | "vote" | "union";
}

/**
 * How many pipeline jobs to run per report and how to combine them. Default since
 * 2026-11-20: 3 runs, vote 2 of 3. --runs 1 gives one uncombined run (waves up to
 * 2.7); --combine union (2 or 3 runs) is for experiments. Group mode runs once.
 */
export function runPlan(argv: string[]): RunPlan {
  const value = (flag: string) => {
    const i = argv.indexOf(flag);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const groups = argv.includes("--groups");
  const runsText = value("--runs");
  const combineText = value("--combine");
  if (groups) {
    if (runsText || combineText)
      throw new Error(
        "--groups runs one job per group; drop --runs and --combine",
      );
    return { runs: 1, combine: "none" };
  }
  const runs = Number(runsText ?? "3");
  if (!Number.isInteger(runs) || runs < 1 || runs > 5)
    throw new Error("--runs must be an integer from 1 to 5");
  if (runs === 1) {
    if (combineText)
      throw new Error("--runs 1 has nothing to combine; drop --combine");
    return { runs, combine: "none" };
  }
  const combine = combineText ?? "vote";
  if (combine !== "vote" && combine !== "union")
    throw new Error("--combine must be vote or union");
  if (combine === "vote" && runs < 3)
    throw new Error(
      "vote needs at least 3 runs (2 of 3); use --combine union for 2",
    );
  return { runs, combine };
}

interface SavedReferences {
  model: string;
  entries: ReferenceEntry[];
  references: MappedReference[];
  stats: { batches: number; retries: number; fallbacks: number };
  usage: { promptTokens: number; completionTokens: number };
}

async function referencePass(
  entries: ReferenceEntry[],
  model: string,
): Promise<SavedReferences> {
  const client = createLLMClient(judgeClientConfig(loadLLMConfig(), model));
  const usage = { promptTokens: 0, completionTokens: 0 };
  const { references, stats } = await mapReferences(entries, async (batch) => {
    const result = await client.complete({
      use: "crva_extraction",
      messages: [{ role: "user", content: referencePrompt(batch) }],
      jsonSchema: { name: "references", schema: REFERENCE_ANSWER_SCHEMA },
    });
    usage.promptTokens += result.usage?.promptTokens ?? 0;
    usage.completionTokens += result.usage?.completionTokens ?? 0;
    return JSON.parse(result.content);
  });
  return { model, entries, references, stats, usage };
}

async function main() {
  env.loadEnvConfig(APP_DIR);
  const city = argValue("--city");
  const pdf = path.resolve(argValue("--pdf"));
  const ocr = await readOcrCache(argValue("--ocr"));
  const mismatch = ocrMismatch(pdf, ocr);
  if (mismatch) throw new Error(mismatch);
  const resultsDir = process.argv.includes("--results-dir")
    ? path.resolve(argValue("--results-dir"))
    : null;
  // Recovery reads the plan from the result files there; a new run from the flags.
  const savedRuns = resultsDir
    ? existsSync(path.join(resultsDir, `result-${SINGLE}.json`))
      ? 1
      : [1, 2, 3, 4, 5].filter((k) =>
          existsSync(path.join(resultsDir, `result-${SINGLE}-${k}.json`)),
        ).length
    : null;
  const groupsMode = resultsDir
    ? savedRuns === 0
    : process.argv.includes("--groups");
  const plan: RunPlan =
    savedRuns === null
      ? runPlan(process.argv)
      : groupsMode || savedRuns === 1
        ? { runs: 1, combine: "none" }
        : runPlan([...process.argv, "--runs", String(savedRuns)]);
  const jobIds = groupsMode
    ? CRVA_GROUPS.map((g) => g.id)
    : plan.runs === 1
      ? [SINGLE]
      : Array.from({ length: plan.runs }, (_, k) => `${SINGLE}-${k + 1}`);
  const outDir =
    resultsDir ??
    path.join(
      APP_DIR,
      "reports",
      "crva-eval",
      city,
      groupsMode ? "agentic-extraction-groups" : "agentic-extraction-refs",
      new Date().toISOString().replace(/[:.]/g, "-"),
    );
  await mkdir(path.join(outDir, "inputs"), { recursive: true });

  const entries = findReferenceEntries(ocr.pages);
  const options = { referencePass: entries.length > 0 };
  const jobs: {
    group: string;
    jobId: string | null;
    exitCode: number | null;
  }[] = [];
  let minutes = Number(argValue("--minutes", "0"));
  let config: Awaited<ReturnType<typeof checkService>> | null = null;
  let references: SavedReferences | null = null;
  let previousFingerprint: string | null = null;
  const referencesPath = path.join(outDir, "references.json");

  if (!resultsDir) {
    const pipelineDir = path.resolve(argValue("--pipeline-dir"));
    const baseUrl = argValue("--base-url", "http://127.0.0.1:8080");
    const python = path.join(pipelineDir, ".venv", "Scripts", "python.exe");
    for (const file of [pdf, python]) {
      if (!existsSync(file)) throw new Error(`Not found: ${file}`);
    }
    config = await checkService(baseUrl, false);
    const defaultPrompt = await readFile(
      path.join(pipelineDir, "extractor", "prompts", "user.md"),
      "utf8",
    );
    const started = Date.now();
    const referenceModel = argValue("--reference-model", "gpt-5.6-luna");
    // Saved as soon as it is done, so a crash during the jobs keeps the paid pass.
    const referenceRun = options.referencePass
      ? referencePass(entries, referenceModel).then(async (saved) => {
          await writeFile(referencesPath, JSON.stringify(saved, null, 2));
          return saved;
        })
      : Promise.resolve(null);
    // allSettled: one client that fails to start must not lose the others' job IDs.
    const settled = await Promise.allSettled(
      jobIds.map(async (id) => {
        const group = { id };
        const spec = groupsMode ? CRVA_GROUPS.find((g) => g.id === id)! : null;
        const schema = path.join(outDir, "inputs", `${id}.schema.json`);
        const userPrompt = path.join(outDir, "inputs", `${id}.md`);
        await writeFile(
          schema,
          JSON.stringify(
            spec ? groupJsonSchema(spec, options) : crvaJsonSchema(),
            null,
            2,
          ),
        );
        await writeFile(
          userPrompt,
          spec
            ? groupUserPrompt(defaultPrompt, spec, options)
            : crvaUserPrompt(defaultPrompt, {
                c1Split: !process.argv.includes("--no-c1-split"),
              }),
        );
        const logPath = path.join(outDir, `client-${group.id}.log`);
        const exitCode = await runClient({
          python,
          args: clientArgs({
            pipelineDir,
            city,
            pdf,
            schema,
            userPrompt,
            ocrOn: false,
            output: path.join(outDir, `result-${group.id}.json`),
            baseUrl,
          }),
          cwd: pipelineDir,
          logPath,
        });
        const jobId = parseJobId(await readFile(logPath, "utf8"));
        jobs.push({ group: group.id, jobId, exitCode });
        if (exitCode !== 0) {
          console.error(
            `${group.id}: client exited with ${exitCode}. ${failureNote(jobId)}`,
          );
        }
      }),
    );
    for (const [i, outcome] of settled.entries()) {
      if (outcome.status === "rejected") {
        const group = jobIds[i];
        jobs.push({ group, jobId: null, exitCode: null });
        console.error(
          `${group}: client did not run: ${String(outcome.reason)}`,
        );
      }
    }
    references = await referenceRun;
    minutes = Math.round(((Date.now() - started) / 60_000) * 10) / 10;
  } else {
    // Recovery keeps what the first conversion knew: job IDs (from the client
    // logs), wall time and the service fingerprint.
    for (const group of jobIds) {
      const log = path.join(outDir, `client-${group}.log`);
      const jobId = existsSync(log)
        ? parseJobId(await readFile(log, "utf8"))
        : null;
      jobs.push({ group, jobId, exitCode: 0 });
    }
    const previousPath = path.join(outDir, "run-1.json");
    if (existsSync(previousPath)) {
      const previous = JSON.parse(await readFile(previousPath, "utf8")) as {
        stats?: { minutes?: number };
        agentic?: { fingerprint?: string | null };
      };
      if (!process.argv.includes("--minutes"))
        minutes = previous.stats?.minutes ?? 0;
      previousFingerprint = previous.agentic?.fingerprint ?? null;
    }
    if (existsSync(referencesPath)) {
      references = JSON.parse(await readFile(referencesPath, "utf8"));
    } else if (options.referencePass) {
      console.warn(
        "references.json is missing: A1.2a has no reference-list items, and the A1 job skipped the list.",
      );
    }
  }

  const loaded = await Promise.all(
    jobIds.map(async (group) => {
      const file = path.join(outDir, `result-${group}.json`);
      const envelope: unknown = existsSync(file)
        ? JSON.parse(await readFile(file, "utf8"))
        : { result: null, execution_status: "missing" };
      return { group, envelope };
    }),
  );
  const fromReferences = references
    ? referenceItems(
        references.entries,
        references.references,
        captionSources(ocr.pages),
      )
    : null;
  // Groups: the A1 job already left the reference list out. Single job: union
  // (wave 2.6, default) keeps the job's A1.2a items no reference item covers;
  // replace (wave 2.5) drops them.
  const referenceMode = argValue("--reference-mode", "union");
  if (referenceMode !== "union" && referenceMode !== "replace")
    throw new Error("--reference-mode must be union or replace");

  /** One converted run from some of the loaded jobs (all groups, or one single job). */
  const convert = (subset: typeof loaded) => {
    const merged = mergeGroupResults(
      subset.map(({ group, envelope }) => ({
        groupId: group,
        result: (envelope as { result?: unknown } | null)?.result ?? null,
      })),
    );
    const items = groupsMode
      ? [...merged.items, ...(fromReferences ?? [])]
      : referenceMode === "union"
        ? unionReferenceItems(merged.items, fromReferences)
        : withReferenceItems(merged.items, fromReferences);
    const bundle = assembleAgenticBundle({
      file: ocr.file,
      items,
      badPointers: merged.badPointers,
      ocr,
      extractionModel: MODEL,
    });
    const envelope = mergeEnvelopes(subset.map((l) => l.envelope));
    const stats = agenticRunStats({
      run: 1,
      envelope,
      bundle,
      minutes,
      ocr,
      ocrOn: false,
    });
    return { merged, bundle, envelope, stats };
  };

  const parts =
    plan.combine === "none"
      ? [convert(loaded)]
      : loaded.map((l) => convert([l]));
  for (const [k, part] of parts.entries()) {
    if (parts.length === 1) break;
    await writeFile(
      path.join(outDir, `part-${k + 1}.json`),
      JSON.stringify(
        {
          stats: { ...part.stats, run: k + 1 },
          warnings: [],
          bundle: part.bundle,
        },
        null,
        2,
      ),
    );
  }
  const combined =
    plan.combine === "none"
      ? null
      : combineRuns({
          bundles: parts.map((p) => p.bundle),
          stats: parts.map((p) => p.stats),
          mode: plan.combine,
        });
  const bundle = combined?.bundle ?? parts[0].bundle;
  const jobStats = combined
    ? {
        ...combined.stats,
        status: parts.some((p) => p.stats.status === "failed")
          ? ("failed" as const)
          : combined.stats.status,
      }
    : parts[0].stats;
  const envelope = mergeEnvelopes(loaded.map((l) => l.envelope));
  const merged = {
    ambiguousItems: parts.reduce((t, p) => t + p.merged.ambiguousItems, 0),
  };
  // The reference pass (one per report) is part of the run's cost.
  const stats = references
    ? {
        ...jobStats,
        promptTokens: jobStats.promptTokens + references.usage.promptTokens,
        completionTokens:
          jobStats.completionTokens + references.usage.completionTokens,
        llmCalls:
          jobStats.llmCalls +
          references.stats.batches +
          references.stats.retries,
      }
    : jobStats;
  await writeFile(
    path.join(outDir, "run-1.json"),
    JSON.stringify(
      {
        stats,
        warnings: [],
        bundle,
        agentic: {
          mode: groupsMode ? "groups" : SINGLE,
          referenceMode: groupsMode ? null : referenceMode,
          plan,
          valuesPerRun: combined?.valuesPerRun ?? null,
          recovered: resultsDir !== null,
          model: config?.model ?? MODEL,
          reasoningEffort: config?.reasoning_effort ?? "medium",
          fingerprint:
            config?.implementation_fingerprint ?? previousFingerprint,
          referencesMissing: options.referencePass && !references,
          ambiguousItems: merged.ambiguousItems,
          usage: envelope.usage,
          jobs: loaded.map(({ group, envelope: e }) => {
            const j = e as {
              execution_status?: string;
              usage?: unknown;
              repair?: { repairs?: number };
            };
            return {
              group,
              jobId: jobs.find((x) => x.group === group)?.jobId ?? null,
              status: j.execution_status ?? null,
              repairs: j.repair?.repairs ?? null,
              usage: j.usage ?? null,
            };
          }),
          references: references
            ? {
                model: references.model,
                entries: references.entries.length,
                stats: references.stats,
                usage: references.usage,
              }
            : null,
        },
      },
      null,
      2,
    ),
  );
  await writeFile(path.join(outDir, "runs.md"), runsTableMarkdown([stats]));
  for (const job of jobs)
    console.log(`job ${job.group} ${job.jobId} exit ${job.exitCode}`);
  console.log(
    `run 1: ${stats.status}${stats.error ? ` (${stats.error})` : ""}; status ${envelope.execution_status}`,
  );
  console.log(`Wrote ${outDir}`);
  if (jobs.some((j) => j.exitCode !== 0) || stats.status === "failed") {
    process.exitCode = 1;
  }
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
