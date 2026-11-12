/**
 * Logs a finished PDF extraction benchmark run to the shared MLflow server.
 *
 * Plain REST with `fetch` and basic auth, no SDK. Logging is best effort: the
 * function never throws; on the first failed request it stops and reports why.
 * Only an allow-list of files leaves the machine (`report.md`, `results.json`
 * and per-attempt `extracted-values.json`); PDFs, OCR text and answer keys do
 * not. Metrics and `results.json` go through the same sanitizer as the run
 * folder (redact.ts), so no expected value is sent.
 */
import { existsSync, readFileSync } from "node:fs";
import { basename, join } from "node:path";
import type {
  BlockSummary,
  CaseVerdict,
} from "@/backend/ingestion-benchmark/metrics";
import { publishableSummary } from "@/backend/ingestion-benchmark/redact";
import type { RunSummary } from "@/backend/ingestion-benchmark/report";

export type MlflowConfig = {
  trackingUri: string;
  username: string;
  password: string;
  experimentName: string;
  timeoutMs: number;
};

export type MlflowResult =
  { logged: true; runUrl: string } | { logged: false; reason: string };

const EXPERIMENT_NAME = "ghgi-pdf-benchmark";
const TIMEOUT_MS = 10_000;
const MAX_METRICS_PER_BATCH = 1000;
const UPLOAD_ALLOW_LIST = new Set([
  "report.md",
  "results.json",
  "extracted-values.json",
]);

export function mlflowConfigFromEnv(
  env: NodeJS.ProcessEnv,
  disabled: boolean,
): MlflowConfig | null {
  if (disabled) return null;
  const trackingUri = env.MLFLOW_TRACKING_URI;
  const username = env.MLFLOW_TRACKING_USERNAME;
  const password = env.MLFLOW_TRACKING_PASSWORD;
  if (!trackingUri || !username || !password) return null;
  return {
    trackingUri,
    username,
    password,
    experimentName: EXPERIMENT_NAME,
    timeoutMs: TIMEOUT_MS,
  };
}

type Metric = { key: string; value: number; timestamp: number; step: number };

class MlflowFailure extends Error {}

const sanitizeName = (name: string) => name.replace(/[^A-Za-z0-9_.\-/ ]/g, "_");

const asNumber = (value: unknown): number | null =>
  typeof value === "boolean"
    ? Number(value)
    : typeof value === "number" && Number.isFinite(value)
      ? value
      : null;

/** Numeric and boolean top-level fields of `source`, nulls skipped. */
function numericMetrics(
  source: Record<string, unknown>,
  prefix: string,
  skip: string[],
  now: number,
): Metric[] {
  return Object.entries(source).flatMap(([field, raw]) => {
    const value = skip.includes(field) ? null : asNumber(raw);
    return value === null
      ? []
      : [
          {
            key: sanitizeName(`${prefix}${field}`),
            value,
            timestamp: now,
            step: 0,
          },
        ];
  });
}

function attemptMetrics(
  summary: RunSummary,
  caseId: string,
  now: number,
): Metric[] {
  const result = summary.results.find((r) => r.id === caseId);
  if (!result) return [];
  return result.runs.flatMap((run) => {
    const values: [string, unknown][] = [
      ["attempt.row_recall", run.score?.rowRecall],
      ["attempt.seconds", run.stageMs?.total / 1000],
      ["attempt.prompt_tokens", run.usage?.promptTokens],
      ["attempt.completion_tokens", run.usage?.completionTokens],
    ];
    return values.flatMap(([key, raw]) => {
      const value = asNumber(raw);
      return value === null
        ? []
        : [{ key, value, timestamp: now, step: run.run }];
    });
  });
}

/** results.json as it is uploaded: sanitized again, so a file written before redaction leaks nothing. */
function publishedResults(file: string): string {
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(file, "utf8"));
  } catch {
    throw new MlflowFailure("results.json is not valid JSON");
  }
  return JSON.stringify(publishableSummary((parsed ?? {}) as object), null, 2);
}

export async function logBenchmarkRun(args: {
  config: MlflowConfig;
  summary: RunSummary;
  verdicts: CaseVerdict[];
  blocks: BlockSummary[];
  runFolder: string;
  fetchImpl?: typeof fetch;
  now?: () => number;
}): Promise<MlflowResult> {
  const { config, verdicts, blocks, runFolder } = args;
  const summary = publishableSummary(args.summary);
  const doFetch = args.fetchImpl ?? fetch;
  const now = args.now ?? Date.now;
  const base = config.trackingUri.replace(/\/+$/, "");
  const auth = `Basic ${Buffer.from(`${config.username}:${config.password}`).toString("base64")}`;

  /** One request with its own timeout. Throws MlflowFailure on any failure. */
  async function send(
    method: string,
    path: string,
    body?: string | Uint8Array,
    contentType = "application/json",
    allow404 = false,
  ): Promise<any> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), config.timeoutMs);
    try {
      const response = await doFetch(`${base}/${path}`, {
        method,
        headers: { Authorization: auth, "Content-Type": contentType },
        body: body as BodyInit | undefined,
        signal: controller.signal,
      });
      if (allow404 && response.status === 404) return null;
      if (!response.ok) {
        throw new MlflowFailure(
          `${method} /${path} returned ${response.status}`,
        );
      }
      const text = await response.text();
      return text ? JSON.parse(text) : {};
    } catch (error) {
      if (error instanceof MlflowFailure) throw error;
      const name = error instanceof Error ? error.name : "Error";
      throw new MlflowFailure(`${method} /${path} failed: ${name}`);
    } finally {
      clearTimeout(timer);
    }
  }

  const post = (path: string, body: unknown) =>
    send("POST", `api/2.0/mlflow/${path}`, JSON.stringify(body));

  const tagList = (tags: Record<string, string>) =>
    Object.entries(tags).map(([key, value]) => ({ key, value }));

  async function createRun(
    experimentId: string,
    tags: Record<string, string>,
  ): Promise<string> {
    const created = await post("runs/create", {
      experiment_id: experimentId,
      start_time: now(),
      tags: tagList(tags),
    });
    const id = created?.run?.info?.run_id;
    if (typeof id !== "string") {
      throw new MlflowFailure(
        "POST /api/2.0/mlflow/runs/create returned no run id",
      );
    }
    return id;
  }

  async function logMetrics(runId: string, metrics: Metric[]) {
    for (let i = 0; i < metrics.length; i += MAX_METRICS_PER_BATCH) {
      await post("runs/log-batch", {
        run_id: runId,
        metrics: metrics.slice(i, i + MAX_METRICS_PER_BATCH),
      });
    }
  }

  async function upload(
    experimentId: string,
    runId: string,
    relativePath: string,
  ) {
    const name = basename(relativePath);
    if (!UPLOAD_ALLOW_LIST.has(name)) return;
    const file = join(runFolder, ...relativePath.split("/"));
    if (!existsSync(file)) return;
    const encoded = relativePath.split("/").map(encodeURIComponent).join("/");
    await send(
      "PUT",
      `api/2.0/mlflow-artifacts/artifacts/${experimentId}/${runId}/artifacts/${encoded}`,
      name === "results.json"
        ? new TextEncoder().encode(publishedResults(file))
        : new Uint8Array(readFileSync(file)),
      name.endsWith(".json") ? "application/json" : "text/markdown",
    );
  }

  const finish = (runId: string, status: "FINISHED" | "FAILED") =>
    post("runs/update", { run_id: runId, status, end_time: now() });

  let parentRunId: string | null = null;
  try {
    const found = await send(
      "GET",
      `api/2.0/mlflow/experiments/get-by-name?experiment_name=${encodeURIComponent(config.experimentName)}`,
      undefined,
      "application/json",
      true,
    );
    const experimentId: string = found
      ? found.experiment.experiment_id
      : (await post("experiments/create", { name: config.experimentName }))
          .experiment_id;

    const none = (value: string | null | undefined) => value ?? "none";
    parentRunId = await createRun(experimentId, {
      commit: none(summary.commit),
      branch: none(summary.branch),
      dirty: String(summary.dirty),
      extraction_model: none(summary.extractionModel),
      ocr_model: none(summary.ocrModel),
      reasoning_effort: none(summary.reasoningEffort),
      prompt_hash: none(summary.promptHash),
      input_representation: none(summary.inputRepresentation),
      test_set_version: none(summary.testSetVersion),
      scorer_version: none(summary.scorerVersion),
      selection: summary.selection.join(",") || "none",
      exploratory: String(summary.exploratory),
      interrupted: String(summary.interrupted),
      "mlflow.runName": basename(runFolder),
    });

    await logMetrics(
      parentRunId,
      blocks.flatMap((block) =>
        numericMetrics(block, `${block.block}.`, ["block"], now()),
      ),
    );
    await upload(experimentId, parentRunId, "report.md");
    await upload(experimentId, parentRunId, "results.json");

    for (const verdict of verdicts) {
      const childId = await createRun(experimentId, {
        "mlflow.parentRunId": parentRunId,
        "mlflow.runName": verdict.id,
      });
      await logMetrics(childId, [
        ...numericMetrics(verdict, "", ["id"], now()),
        ...attemptMetrics(summary, verdict.id, now()),
      ]);
      const result = summary.results.find((r) => r.id === verdict.id);
      for (const run of result?.runs ?? []) {
        await upload(
          experimentId,
          childId,
          `cases/${verdict.id}/attempt-${run.run}/extracted-values.json`,
        );
      }
      await finish(childId, "FINISHED");
    }

    await finish(parentRunId, "FINISHED");
    return {
      logged: true,
      runUrl: `${base}/#/experiments/${experimentId}/runs/${parentRunId}`,
    };
  } catch (error) {
    if (parentRunId) {
      try {
        await finish(parentRunId, "FAILED");
      } catch {
        // best effort only
      }
    }
    return {
      logged: false,
      reason:
        error instanceof Error ? error.message : "unknown MLflow logging error",
    };
  }
}
