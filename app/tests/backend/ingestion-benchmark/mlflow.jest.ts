import { afterEach, describe, expect, it } from "@jest/globals";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  logBenchmarkRun,
  mlflowConfigFromEnv,
  type MlflowConfig,
} from "@/backend/ingestion-benchmark/mlflow";
import type {
  BlockSummary,
  CaseVerdict,
} from "@/backend/ingestion-benchmark/metrics";
import type { RunSummary } from "@/backend/ingestion-benchmark/report";

const config: MlflowConfig = {
  trackingUri: "https://mlflow.test/",
  username: "svc",
  password: "pw",
  experimentName: "ghgi-pdf-benchmark",
  timeoutMs: 1000,
};

const env = {
  MLFLOW_TRACKING_URI: "https://mlflow.test",
  MLFLOW_TRACKING_USERNAME: "svc",
  MLFLOW_TRACKING_PASSWORD: "pw",
};

type Call = { method: string; url: string; body: any; headers: any };

const attempt = (run: number) => ({
  run,
  failureMode: "scored",
  warnings: [],
  ok: true,
  ms: 1000,
  stageMs: { ocr: 1, extraction: 2, import: 3, total: 1000 * run },
  score: { rowRecall: 0.5 + run / 10, totalDiffPct: run },
  usage: { calls: 1, promptTokens: 100 * run, completionTokens: 10 * run },
});

const summary = {
  measuredAt: "2026-05-01T10:00:00.000Z",
  commit: "abc1234",
  branch: "main",
  extractionModel: "gpt-x",
  reasoningEffort: null,
  ocrModel: "ocr-y",
  runsPerFile: 3,
  selection: ["C-001", "C-002"],
  exploratory: false,
  interrupted: false,
  promptHash: "hash9",
  inputRepresentation: "ocr_markdown",
  testSetVersion: "v7",
  dirty: false,
  mlflowRunUrl: null,
  mlflowNote: null,
  results: ["C-001", "C-002"].map((id) => ({
    id,
    runs: [attempt(1), attempt(2), attempt(3)],
  })),
} as unknown as RunSummary;

const verdicts = ["C-001", "C-002"].map((id) => ({
  id,
  block: "validated",
  eligible: true,
  attempts: 3,
  attemptsPassed: 2,
  casePasses: false,
  exploratory: false,
  recallFailedAsZero: 0.75,
  recallScoredOnly: null,
  totalWithinToleranceAll: null,
  failureModes: {},
  costUsd: null,
  seconds: 6,
})) as unknown as CaseVerdict[];

const blocks = [
  {
    block: "validated",
    casesInRun: 2,
    casesInManifest: 5,
    headlineRecall: 0.75,
    recallScoredOnly: null,
    tenXAttempts: 0,
  },
] as unknown as BlockSummary[];

let dir: string;
function makeFolder(): string {
  dir = mkdtempSync(join(tmpdir(), "ia-mlflow-"));
  writeFileSync(join(dir, "report.md"), "# report");
  writeFileSync(join(dir, "results.json"), "{}");
  writeFileSync(join(dir, "input.pdf"), "pdf");
  writeFileSync(join(dir, "ocr.md"), "ocr");
  writeFileSync(join(dir, "answer-key.json"), "{}");
  for (const id of ["C-001", "C-002"]) {
    for (const n of [1, 2, 3]) {
      const d = join(dir, "cases", id, `attempt-${n}`);
      mkdirSync(d, { recursive: true });
      writeFileSync(join(d, "extracted-values.json"), "[]");
      writeFileSync(join(d, "ocr.md"), "ocr");
      writeFileSync(join(d, "answer-key.json"), "{}");
    }
  }
  return dir;
}
afterEach(() => {
  if (dir) rmSync(dir, { recursive: true, force: true });
});

function server(
  opts: { experimentExists?: boolean; failPath?: RegExp; status?: number } = {},
) {
  const calls: Call[] = [];
  let runCount = 0;
  const fetchImpl = (async (url: any, init: any) => {
    const u = String(url);
    const body =
      typeof init?.body === "string" && init.body.startsWith("{")
        ? JSON.parse(init.body)
        : init?.body;
    calls.push({ method: init.method, url: u, body, headers: init.headers });
    const json = (status: number, data: unknown) =>
      new Response(JSON.stringify(data), { status });
    if (opts.failPath?.test(u)) return json(opts.status ?? 401, {});
    if (u.includes("experiments/get-by-name")) {
      return opts.experimentExists === false
        ? json(404, { error_code: "RESOURCE_DOES_NOT_EXIST" })
        : json(200, { experiment: { experiment_id: "7" } });
    }
    if (u.endsWith("experiments/create"))
      return json(200, { experiment_id: "9" });
    if (u.endsWith("runs/create")) {
      runCount += 1;
      return json(200, { run: { info: { run_id: `run${runCount}` } } });
    }
    return json(200, {});
  }) as unknown as typeof fetch;
  return { calls, fetchImpl };
}

const log = (fetchImpl: typeof fetch, runFolder: string) =>
  logBenchmarkRun({
    config,
    summary,
    verdicts,
    blocks,
    runFolder,
    fetchImpl,
    now: () => 5,
  });

describe("mlflowConfigFromEnv", () => {
  it("returns null config when a variable is missing or --no-mlflow", () => {
    expect(mlflowConfigFromEnv(env, true)).toBeNull();
    expect(
      mlflowConfigFromEnv(
        { ...env, MLFLOW_TRACKING_PASSWORD: undefined },
        false,
      ),
    ).toBeNull();
    expect(
      mlflowConfigFromEnv({ ...env, MLFLOW_TRACKING_URI: "" }, false),
    ).toBeNull();
    expect(mlflowConfigFromEnv(env, false)).toEqual({
      trackingUri: "https://mlflow.test",
      username: "svc",
      password: "pw",
      experimentName: "ghgi-pdf-benchmark",
      timeoutMs: 10_000,
    });
  });
});

describe("logBenchmarkRun", () => {
  it("creates the experiment when get-by-name returns 404", async () => {
    const { calls, fetchImpl } = server({ experimentExists: false });
    const result = await log(fetchImpl, makeFolder());
    expect(calls.some((c) => c.url.endsWith("experiments/create"))).toBe(true);
    expect(result).toEqual({
      logged: true,
      runUrl: "https://mlflow.test/#/experiments/9/runs/run1",
    });
  });

  it("sends basic auth and does not create an existing experiment", async () => {
    const { calls, fetchImpl } = server();
    await log(fetchImpl, makeFolder());
    expect(calls.some((c) => c.url.endsWith("experiments/create"))).toBe(false);
    expect(calls[0].headers.Authorization).toBe(
      `Basic ${Buffer.from("svc:pw").toString("base64")}`,
    );
  });

  it("parent run tags include commit, extraction model, prompt hash and test-set version", async () => {
    const { calls, fetchImpl } = server();
    await log(fetchImpl, makeFolder());
    const parent = calls.find((c) => c.url.endsWith("runs/create"))!;
    const tags = Object.fromEntries(
      parent.body.tags.map((t: any) => [t.key, t.value]),
    );
    expect(tags).toMatchObject({
      commit: "abc1234",
      branch: "main",
      dirty: "false",
      extraction_model: "gpt-x",
      ocr_model: "ocr-y",
      reasoning_effort: "none",
      prompt_hash: "hash9",
      input_representation: "ocr_markdown",
      test_set_version: "v7",
      selection: "C-001,C-002",
      exploratory: "false",
      interrupted: "false",
      "mlflow.runName": expect.stringMatching(/\S/),
    });
  });

  it("logs block metrics as <block>.<metric>, skipping nulls", async () => {
    const { calls, fetchImpl } = server();
    await log(fetchImpl, makeFolder());
    const batch = calls.find(
      (c) => c.url.endsWith("runs/log-batch") && c.body.run_id === "run1",
    )!;
    const keys = batch.body.metrics.map((m: any) => m.key);
    expect(keys).toContain("validated.headlineRecall");
    expect(keys).toContain("validated.casesInRun");
    expect(keys).not.toContain("validated.recallScoredOnly");
    expect(keys).not.toContain("validated.block");
  });

  it("one child run per case with mlflow.parentRunId", async () => {
    const { calls, fetchImpl } = server();
    await log(fetchImpl, makeFolder());
    const creates = calls.filter((c) => c.url.endsWith("runs/create"));
    expect(creates).toHaveLength(3);
    for (const child of creates.slice(1)) {
      const tags = Object.fromEntries(
        child.body.tags.map((t: any) => [t.key, t.value]),
      );
      expect(tags["mlflow.parentRunId"]).toBe("run1");
    }
    const names = creates
      .slice(1)
      .map(
        (c) => c.body.tags.find((t: any) => t.key === "mlflow.runName").value,
      );
    expect(names).toEqual(["C-001", "C-002"]);
  });

  it("attempt metrics carry step 1..3", async () => {
    const { calls, fetchImpl } = server();
    await log(fetchImpl, makeFolder());
    const batch = calls.find(
      (c) => c.url.endsWith("runs/log-batch") && c.body.run_id === "run2",
    )!;
    const recall = batch.body.metrics.filter(
      (m: any) => m.key === "attempt.row_recall",
    );
    expect(recall.map((m: any) => m.step)).toEqual([1, 2, 3]);
    expect(
      batch.body.metrics.some((m: any) => m.key === "attempt.prompt_tokens"),
    ).toBe(true);
    const attempts = batch.body.metrics.find((m: any) => m.key === "attempts");
    expect(attempts).toMatchObject({ value: 3, step: 0, timestamp: 5 });
    const passes = batch.body.metrics.find((m: any) => m.key === "casePasses");
    expect(passes.value).toBe(0);
  });

  it("chunks log-batch calls at 1000 metrics", async () => {
    const big = Array.from({ length: 1100 }, (_, i) => ({
      ...blocks[0],
      block: `b${i}`,
    })) as unknown as BlockSummary[];
    const { calls, fetchImpl } = server();
    await logBenchmarkRun({
      config,
      summary,
      verdicts: [],
      blocks: big,
      runFolder: makeFolder(),
      fetchImpl,
    });
    const batches = calls.filter(
      (c) => c.url.endsWith("runs/log-batch") && c.body.run_id === "run1",
    );
    expect(batches.length).toBeGreaterThan(1);
    expect(batches.every((b) => b.body.metrics.length <= 1000)).toBe(true);
  });

  it("uploads report.md and results.json, never a path ending in .pdf, ocr.md or answer-key.json", async () => {
    const { calls, fetchImpl } = server();
    await log(fetchImpl, makeFolder());
    const puts = calls.filter((c) => c.method === "PUT").map((c) => c.url);
    const base =
      "https://mlflow.test/api/2.0/mlflow-artifacts/artifacts/7/run1/artifacts/";
    expect(puts).toContain(`${base}report.md`);
    expect(puts).toContain(`${base}results.json`);
    expect(puts).toContain(
      "https://mlflow.test/api/2.0/mlflow-artifacts/artifacts/7/run2/artifacts/cases/C-001/attempt-1/extracted-values.json",
    );
    expect(puts).toHaveLength(2 + 6);
    for (const url of puts) {
      expect(url).not.toMatch(/\.pdf$|ocr\.md$|answer-key\.json$/);
    }
  });

  it("sends no answer-key content in any metric, tag or artifact", async () => {
    const secret = {
      expectedTotal: 987654.321,
      totalDiffPct: 42.4242,
      missingRows: [
        { description: "SECRET key row", gpc: "I.4.1", value: 4321.5 },
      ],
      distractorsStored: [
        {
          valueT: 777,
          gpc: "I.1.1",
          what: "SECRET distractor",
          failureMode: "x",
        },
      ],
      unexpectedStored: [],
    };
    const withKey = {
      ...summary,
      results: summary.results.map((r) => ({
        ...r,
        runs: r.runs.map((run) => ({
          ...run,
          score: { ...run.score, ...secret },
        })),
      })),
    } as unknown as RunSummary;
    const folder = makeFolder();
    // A results.json written before redaction existed still goes through the sanitizer.
    writeFileSync(join(folder, "results.json"), JSON.stringify(withKey));
    const { calls, fetchImpl } = server();
    const result = await logBenchmarkRun({
      config,
      summary: withKey,
      verdicts,
      blocks,
      runFolder: folder,
      fetchImpl,
      now: () => 5,
    });
    expect(result.logged).toBe(true);
    const sent = calls
      .map((c) =>
        c.body instanceof Uint8Array
          ? Buffer.from(c.body).toString("utf8")
          : JSON.stringify(c.body ?? ""),
      )
      .join("\n");
    expect(sent).toContain("rowRecall");
    for (const needle of [
      "SECRET",
      "987654",
      "42.4242",
      "4321.5",
      "missingRows",
      "expectedTotal",
      "totalDiffPct",
      "total_diff_pct",
    ]) {
      expect(sent).not.toContain(needle);
    }
  });

  it("marks runs FINISHED on success", async () => {
    const { calls, fetchImpl } = server();
    await log(fetchImpl, makeFolder());
    const updates = calls.filter((c) => c.url.endsWith("runs/update"));
    expect(updates.map((u) => u.body.status)).toEqual([
      "FINISHED",
      "FINISHED",
      "FINISHED",
    ]);
  });

  it("401 returns logged false with the status in reason and stops", async () => {
    const { calls, fetchImpl } = server({
      failPath: /get-by-name/,
      status: 401,
    });
    const result = await log(fetchImpl, makeFolder());
    expect(result.logged).toBe(false);
    expect((result as { reason: string }).reason).toMatch(
      /GET .*get-by-name.*401/,
    );
    expect(calls).toHaveLength(1);
  });

  it("marks the parent FAILED when a later request fails", async () => {
    const { calls, fetchImpl } = server({ failPath: /log-batch/, status: 500 });
    const result = await log(fetchImpl, makeFolder());
    expect(result.logged).toBe(false);
    const last = calls[calls.length - 1];
    expect(last.url).toMatch(/runs\/update$/);
    expect(last.body.status).toBe("FAILED");
  });

  it("timeout returns logged false and does not throw", async () => {
    const fetchImpl = ((_url: any, init: any) =>
      new Promise((_resolve, reject) => {
        init.signal.addEventListener("abort", () => {
          const err = new Error("aborted");
          err.name = "AbortError";
          reject(err);
        });
      })) as unknown as typeof fetch;
    const result = await logBenchmarkRun({
      config: { ...config, timeoutMs: 20 },
      summary,
      verdicts,
      blocks,
      runFolder: makeFolder(),
      fetchImpl,
    });
    expect(result.logged).toBe(false);
    expect((result as { reason: string }).reason).toMatch(/AbortError/);
  });
});
