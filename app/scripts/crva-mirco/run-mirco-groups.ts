/**
 * Wave 2: runs Mirco's pipeline as five jobs, one per field group (groups.ts), in
 * parallel, plus our reference pass for A1.2a (references.ts), and saves one
 * harness run folder that scripts/crva-eval/score-run.ts scores unchanged.
 * Paid: OpenAI (five agent jobs and the reference mapping). Never resubmits a job.
 *
 *   npx tsx scripts/crva-mirco/run-mirco-groups.ts --city <slug> --pdf <report.pdf> \
 *     --ocr reports/crva-eval/<city>/ocr --mirco-dir <path to pdf-extraction> \
 *     [--base-url http://127.0.0.1:8080] [--reference-model gpt-5.6-luna]
 *
 * Recovery, no new jobs: --results-dir <run folder> converts the result-<group>.json
 * files there again (after a usage refresh, say), reusing its references.json.
 *
 * Needs Mirco's service running with gpt-6.1-sol and medium effort (OCR off), and
 * OPENAI_API_KEY in app/.env for the reference mapping (LLM_BASE_URL="").
 * Output: app/reports/crva-eval/<city>/mirco-groups/<timestamp>/ with
 * inputs/<group>.schema.json and .md, client-<group>.log, result-<group>.json,
 * references.json, run-1.json and runs.md. Job IDs are printed; delete the jobs
 * with DELETE /v1/extractions/<id> once their usage is saved.
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
  assembleMircoBundle,
  mergeEnvelopes,
  mergeGroupResults,
  mircoRunStats,
} from "./convert";
import { CRVA_GROUPS, groupJsonSchema, groupUserPrompt } from "./groups";
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
} from "./run-mirco";

function argValue(flag: string, fallback?: string): string {
  const i = process.argv.indexOf(flag);
  const value = i >= 0 ? process.argv[i + 1] : fallback;
  if (!value) throw new Error(`Missing ${flag}`);
  return value;
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
  const outDir =
    resultsDir ??
    path.join(
      APP_DIR,
      "reports",
      "crva-eval",
      city,
      "mirco-groups",
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
  const referencesPath = path.join(outDir, "references.json");

  if (!resultsDir) {
    const mircoDir = path.resolve(argValue("--mirco-dir"));
    const baseUrl = argValue("--base-url", "http://127.0.0.1:8080");
    const python = path.join(mircoDir, ".venv", "Scripts", "python.exe");
    for (const file of [pdf, python]) {
      if (!existsSync(file)) throw new Error(`Not found: ${file}`);
    }
    config = await checkService(baseUrl, false);
    const defaultPrompt = await readFile(
      path.join(mircoDir, "extractor", "prompts", "user.md"),
      "utf8",
    );
    const started = Date.now();
    const referenceModel = argValue("--reference-model", "gpt-5.6-luna");
    const referenceRun = options.referencePass
      ? referencePass(entries, referenceModel)
      : Promise.resolve(null);
    await Promise.all(
      CRVA_GROUPS.map(async (group) => {
        const schema = path.join(outDir, "inputs", `${group.id}.schema.json`);
        const userPrompt = path.join(outDir, "inputs", `${group.id}.md`);
        await writeFile(
          schema,
          JSON.stringify(groupJsonSchema(group, options), null, 2),
        );
        await writeFile(
          userPrompt,
          groupUserPrompt(defaultPrompt, group, options),
        );
        const logPath = path.join(outDir, `client-${group.id}.log`);
        const exitCode = await runClient({
          python,
          args: clientArgs({
            mircoDir,
            city,
            pdf,
            schema,
            userPrompt,
            ocrOn: false,
            output: path.join(outDir, `result-${group.id}.json`),
            baseUrl,
          }),
          cwd: mircoDir,
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
    references = await referenceRun;
    if (references) {
      await writeFile(referencesPath, JSON.stringify(references, null, 2));
    }
    minutes = Math.round(((Date.now() - started) / 60_000) * 10) / 10;
  } else if (existsSync(referencesPath)) {
    references = JSON.parse(await readFile(referencesPath, "utf8"));
  }

  const loaded = await Promise.all(
    CRVA_GROUPS.map(async (group) => {
      const file = path.join(outDir, `result-${group.id}.json`);
      const envelope: unknown = existsSync(file)
        ? JSON.parse(await readFile(file, "utf8"))
        : { result: null, execution_status: "missing" };
      return { group: group.id, envelope };
    }),
  );
  const merged = mergeGroupResults(
    loaded.map(({ group, envelope }) => ({
      groupId: group,
      result: (envelope as { result?: unknown } | null)?.result ?? null,
    })),
  );
  const items = references
    ? [
        ...merged.items,
        ...referenceItems(
          references.entries,
          references.references,
          captionSources(ocr.pages),
        ),
      ]
    : merged.items;
  const bundle = assembleMircoBundle({
    file: ocr.file,
    items,
    badPointers: merged.badPointers,
    ocr,
    extractionModel: MODEL,
  });
  const envelope = mergeEnvelopes(loaded.map((l) => l.envelope));
  const stats = mircoRunStats({
    run: 1,
    envelope,
    bundle,
    minutes,
    ocr,
    ocrOn: false,
  });
  await writeFile(
    path.join(outDir, "run-1.json"),
    JSON.stringify(
      {
        stats,
        warnings: [],
        bundle,
        mirco: {
          mode: "groups",
          recovered: resultsDir !== null,
          model: config?.model ?? MODEL,
          reasoningEffort: config?.reasoning_effort ?? "medium",
          fingerprint: config?.implementation_fingerprint ?? null,
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
