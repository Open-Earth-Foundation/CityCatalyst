/**
 * Turns the output of the GHGI import benchmark into a folder the whole team
 * can read without running anything: a markdown report, the raw results, and
 * per case the original file, the answer key and the extracted values.
 *
 * One folder per run, named `<UTC date>-<UTC time>-<short sha>`, plus an
 * INDEX.md with one line per run so progress across fixes stays visible.
 */
import { execFileSync } from "node:child_process";
import {
  appendFileSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { extname, join } from "node:path";
import type { FileScore, KeyFile, StoredValue } from "./score";

export type Tokens = {
  calls: number;
  promptTokens: number;
  completionTokens: number;
};

/** Unit prices in USD. Any missing price makes the cost "n/a" instead of a guess. */
export type Prices = {
  llmInputPerMTok?: number;
  llmOutputPerMTok?: number;
  ocrPerPage?: number;
};

export type RunEntry = {
  run: number;
  ok: boolean;
  ms: number;
  message?: string;
  extractedRows?: number;
  stored?: StoredValue[];
  score?: FileScore | null;
  total?: number;
  /** LLM usage of this run (extraction). */
  usage?: Tokens;
};

export type CaseResult = {
  id: string;
  file: string;
  kind: string;
  targetYear: number;
  keyId: string | null;
  ocr: { ok?: boolean; code?: string | null } | null;
  productFlowFailsAtOcr: boolean;
  runs: RunEntry[];
  stableTotal: boolean;
  /** OCR is done once per file and shared by its runs. */
  ocrUsage?: Tokens & { pages: number | null };
};

export type RunSummary = {
  measuredAt: string;
  commit: string;
  branch: string;
  llmModel?: string;
  extractionModel?: string;
  ocrModel?: string;
  prices?: Prices;
  runsPerFile: number;
  results: CaseResult[];
};

export type CaseMetrics = {
  ocrOk: boolean | null;
  ocrCode: string | null;
  extractedRows: number | null;
  rowRecall: number | null;
  rowPrecision: number | null;
  valueAccuracy: number | null;
  classificationAccuracy: number | null;
  notationRecovered: number;
  notationScored: number;
  totalDiffPct: number | null;
  totalWithinTolerance: boolean | null;
  stableTotal: boolean;
  seconds: number | null;
};

export type Aggregate = {
  cases: number;
  scored: number;
  ocrFailures: number;
  rowRecall: number | null;
  rowPrecision: number | null;
  valueAccuracy: number | null;
  classificationAccuracy: number | null;
};

const mean = (values: (number | null | undefined)[]): number | null => {
  const present = values.filter((v): v is number => typeof v === "number");
  return present.length
    ? present.reduce((sum, v) => sum + v, 0) / present.length
    : null;
};

export function caseMetrics(result: CaseResult): CaseMetrics {
  const okRuns = result.runs.filter((entry) => entry.ok);
  const scores = okRuns.map((entry) => entry.score ?? null);
  const first = scores.find((score) => score) ?? null;
  return {
    ocrOk: result.ocr ? result.ocr.ok === true : null,
    ocrCode: result.ocr?.code ?? null,
    extractedRows: mean(okRuns.map((entry) => entry.extractedRows)),
    rowRecall: mean(scores.map((score) => score?.rowRecall)),
    rowPrecision: mean(scores.map((score) => score?.rowPrecision)),
    valueAccuracy: mean(scores.map((score) => score?.valueAccuracy)),
    classificationAccuracy: mean(
      scores.map((score) => score?.classificationAccuracy),
    ),
    notationRecovered: first?.notationRecovered ?? 0,
    notationScored: first?.notationScored ?? 0,
    totalDiffPct: mean(scores.map((score) => score?.totalDiffPct)),
    totalWithinTolerance: first?.totalWithinTolerance ?? null,
    stableTotal: result.stableTotal,
    seconds: mean(result.runs.map((entry) => entry.ms / 1000)),
  };
}

export function aggregate(results: CaseResult[]): Aggregate {
  const metrics = results.map(caseMetrics);
  return {
    cases: results.length,
    scored: metrics.filter((m) => m.rowRecall !== null).length,
    ocrFailures: results.filter((result) => result.productFlowFailsAtOcr)
      .length,
    rowRecall: mean(metrics.map((m) => m.rowRecall)),
    rowPrecision: mean(metrics.map((m) => m.rowPrecision)),
    valueAccuracy: mean(metrics.map((m) => m.valueAccuracy)),
    classificationAccuracy: mean(metrics.map((m) => m.classificationAccuracy)),
  };
}

export const ZERO_TOKENS: Tokens = {
  calls: 0,
  promptTokens: 0,
  completionTokens: 0,
};

const addTokens = (a: Tokens, b?: Tokens): Tokens => ({
  calls: a.calls + (b?.calls ?? 0),
  promptTokens: a.promptTokens + (b?.promptTokens ?? 0),
  completionTokens: a.completionTokens + (b?.completionTokens ?? 0),
});

export type CaseUsage = Tokens & { ocrPages: number; ocrPagesKnown: boolean };

/** Everything one case spent: OCR once plus every run's extraction. */
export function caseUsage(result: CaseResult): CaseUsage {
  const tokens = result.runs.reduce(
    (sum, run) => addTokens(sum, run.usage),
    addTokens(ZERO_TOKENS, result.ocrUsage),
  );
  return {
    ...tokens,
    ocrPages: result.ocrUsage?.pages ?? 0,
    ocrPagesKnown: result.ocrUsage?.pages != null,
  };
}

export function totalUsage(results: CaseResult[]): CaseUsage {
  return results.map(caseUsage).reduce(
    (sum, usage) => ({
      ...addTokens(sum, usage),
      ocrPages: sum.ocrPages + usage.ocrPages,
      ocrPagesKnown: sum.ocrPagesKnown && usage.ocrPagesKnown,
    }),
    { ...ZERO_TOKENS, ocrPages: 0, ocrPagesKnown: true },
  );
}

/** USD, or null when a price needed for the usage is missing. */
export function costUsd(usage: CaseUsage, prices?: Prices): number | null {
  const { llmInputPerMTok, llmOutputPerMTok, ocrPerPage } = prices ?? {};
  if (
    llmInputPerMTok === undefined ||
    llmOutputPerMTok === undefined ||
    ocrPerPage === undefined
  ) {
    return null;
  }
  return (
    (usage.promptTokens / 1e6) * llmInputPerMTok +
    (usage.completionTokens / 1e6) * llmOutputPerMTok +
    usage.ocrPages * ocrPerPage
  );
}

const money = (value: number | null) =>
  value === null ? "n/a" : `$${value.toFixed(value < 1 ? 3 : 2)}`;

const tokensText = (usage: CaseUsage) =>
  `${(usage.promptTokens / 1000).toFixed(0)}k / ${(usage.completionTokens / 1000).toFixed(0)}k`;

const pct = (ratio: number | null) =>
  ratio === null ? "n/a" : `${Math.round(ratio * 100)}%`;

const signedPct = (value: number | null) =>
  value === null ? "n/a" : `${value >= 0 ? "+" : ""}${value.toFixed(1)}%`;

/** Change in percentage points, empty when either side is missing. */
function delta(now: number | null, before: number | null | undefined) {
  if (now === null || before === null || before === undefined) return "";
  const points = Math.round((now - before) * 100);
  return points === 0 ? " (=)" : ` (${points > 0 ? "+" : ""}${points} pts)`;
}

const cell = (text: string) => text.replace(/\|/g, "\\|");

export function renderReport(
  summary: RunSummary,
  previous: RunSummary | null,
): string {
  const total = aggregate(summary.results);
  const before = previous ? aggregate(previous.results) : null;
  const previousById = new Map(
    (previous?.results ?? []).map((result) => [result.id, caseMetrics(result)]),
  );
  const usage = totalUsage(summary.results);
  const cost = costUsd(usage, summary.prices);
  const beforeCost = previous
    ? costUsd(totalUsage(previous.results), previous.prices)
    : null;
  const lines: string[] = [
    `# Ingestion accuracy run ${summary.measuredAt.slice(0, 16).replace("T", " ")} UTC`,
    "",
    `- Commit: \`${summary.commit}\` on \`${summary.branch}\``,
    `- Extraction model: ${summary.extractionModel ?? summary.llmModel ?? "default"}; OCR model: ${summary.ocrModel ?? "default"}`,
    `- Runs per file: ${summary.runsPerFile}`,
    `- Compared with: ${previous ? `previous run \`${previous.commit}\` (${previous.measuredAt.slice(0, 10)})` : "no previous run"}`,
    "",
    "## Summary",
    "",
    `- Cases: ${total.cases} (${total.scored} scored row by row)`,
    `- Cases a user would see fail at OCR: ${total.ocrFailures}${before ? ` (before: ${before.ocrFailures})` : ""}`,
    `- Mean row recall: ${pct(total.rowRecall)}${delta(total.rowRecall, before?.rowRecall)}`,
    `- Mean row precision: ${pct(total.rowPrecision)}${delta(total.rowPrecision, before?.rowPrecision)}`,
    `- Mean value accuracy: ${pct(total.valueAccuracy)}${delta(total.valueAccuracy, before?.valueAccuracy)}`,
    `- Mean classification accuracy: ${pct(total.classificationAccuracy)}${delta(total.classificationAccuracy, before?.classificationAccuracy)}`,
    "",
    "## Cost of this run",
    "",
    `- LLM: ${usage.calls} calls, ${usage.promptTokens.toLocaleString("en-US")} input and ${usage.completionTokens.toLocaleString("en-US")} output tokens`,
    `- OCR: ${usage.ocrPagesKnown ? `${usage.ocrPages} pages` : `${usage.ocrPages}+ pages (some OCR calls failed before reporting pages)`}`,
    `- Estimated cost: ${money(cost)}${beforeCost !== null && cost !== null ? ` (previous run: ${money(beforeCost)})` : ""}${cost === null ? " (set llmInputPerMTok, llmOutputPerMTok and ocrPerPage under `prices` in the config to get a dollar figure)" : ""}`,
    "",
    "## Per case",
    "",
    "Recall, precision and accuracies are means over the runs that finished. Change vs the previous run is in points.",
    "",
    "| Case | File | OCR | Rows | Recall | Precision | Value acc. | Class. acc. | Notation keys | Total vs key | Stable total | Time | Tokens in / out | OCR pages | Est. cost |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |",
  ];
  for (const result of summary.results) {
    const m = caseMetrics(result);
    const old = previousById.get(result.id);
    const ocr =
      m.ocrOk === null ? "n/a" : m.ocrOk ? "ok" : `fails ${m.ocrCode ?? ""}`;
    lines.push(
      `| ${cell(result.keyId ?? result.id)} | ${cell(result.file)} | ${ocr.trim()} | ${m.extractedRows === null ? "n/a" : Math.round(m.extractedRows)} | ${pct(m.rowRecall)}${delta(m.rowRecall, old?.rowRecall)} | ${pct(m.rowPrecision)}${delta(m.rowPrecision, old?.rowPrecision)} | ${pct(m.valueAccuracy)}${delta(m.valueAccuracy, old?.valueAccuracy)} | ${pct(m.classificationAccuracy)} | ${m.notationRecovered}/${m.notationScored} | ${signedPct(m.totalDiffPct)}${m.totalWithinTolerance === null ? "" : m.totalWithinTolerance ? " (within tolerance)" : " (outside tolerance)"} | ${m.stableTotal ? "yes" : "no"} | ${m.seconds === null ? "n/a" : `${Math.round(m.seconds)} s`} | ${tokensText(caseUsage(result))} | ${result.ocrUsage?.pages ?? "n/a"} | ${money(costUsd(caseUsage(result), summary.prices))} |`,
    );
  }

  const weakest = summary.results
    .map((result) => ({ result, m: caseMetrics(result) }))
    .filter(({ m }) => m.rowRecall !== null)
    .sort((a, b) => (a.m.rowRecall ?? 0) - (b.m.rowRecall ?? 0))
    .slice(0, 3);
  if (weakest.length) {
    lines.push("", "## Lowest recall: what is missing", "");
    for (const { result, m } of weakest) {
      const score = result.runs.find((entry) => entry.ok && entry.score)?.score;
      lines.push(
        `### ${result.keyId ?? result.id} (${pct(m.rowRecall)} recall)`,
        "",
      );
      const missing = (score?.missingRows ?? []).slice(0, 8);
      lines.push(
        missing.length
          ? "Missing rows (first run):"
          : "No missing rows listed.",
      );
      for (const row of missing) {
        lines.push(
          `- ${row.gpc || "no ref"}: ${row.description}${row.value === null ? "" : ` (${row.value} t)`}`,
        );
      }
      const unexpected = (score?.unexpectedStored ?? []).slice(0, 5);
      if (unexpected.length) {
        lines.push("", "Stored but not in the key:");
        for (const row of unexpected) {
          lines.push(`- ${row.gpc} scope ${row.scope ?? "?"}: ${row.valueT} t`);
        }
      }
      lines.push("");
    }
  }

  lines.push(
    "## Files in this folder",
    "",
    "- `results.json`: full output of every run",
    "- `cases/<id>/answer-key.json`: expected rows from the Product workbook",
    "- `cases/<id>/extracted-values.json`: values stored by the import, per run",
    "- `cases/<id>/original.*`: the input file, when `publishInputs` is set in the config",
    "",
  );
  return lines.join("\n");
}

export function renderIndexLine(summary: RunSummary, folder: string): string {
  const total = aggregate(summary.results);
  const cost = costUsd(totalUsage(summary.results), summary.prices);
  return `| ${summary.measuredAt.slice(0, 16).replace("T", " ")} | \`${summary.commit}\` | ${total.cases} | ${total.ocrFailures} | ${pct(total.rowRecall)} | ${pct(total.valueAccuracy)} | ${money(cost)} | [${folder}](./${folder}/report.md) |`;
}

const INDEX_HEADER = [
  "# Ingestion accuracy runs",
  "",
  "One line per benchmark run, oldest first. Open the report for per-case numbers and the change vs the previous run.",
  "",
  "| Run (UTC) | Commit | Cases | OCR failures | Mean recall | Mean value acc. | Est. cost | Report |",
  "| --- | --- | --- | --- | --- | --- | --- | --- |",
  "",
].join("\n");

export function gitInfo(): { commit: string; branch: string } {
  const git = (...args: string[]) => {
    try {
      return execFileSync("git", args, { encoding: "utf8" }).trim();
    } catch {
      return "unknown";
    }
  };
  return {
    commit: git("rev-parse", "--short", "HEAD"),
    branch: git("rev-parse", "--abbrev-ref", "HEAD"),
  };
}

export function runFolderName(measuredAt: string, commit: string): string {
  const stamp = measuredAt.slice(0, 16).replace("T", "-").replace(":", "");
  return `${stamp}-${commit}`;
}

export type CaseInput = {
  id: string;
  /** Path of the input file. Copied only when publishInputs is true. */
  path: string;
  key: KeyFile | null;
};

/**
 * Writes the run folder under `root` and appends to `root/INDEX.md`. Returns
 * the folder path. The previous run is the newest sibling folder that has a
 * results.json.
 */
export function writeRunArtifact(args: {
  root: string;
  summary: RunSummary;
  inputs: CaseInput[];
  publishInputs: boolean;
}): string {
  const { root, summary, inputs, publishInputs } = args;
  const folder = runFolderName(summary.measuredAt, summary.commit);
  const dir = join(root, folder);
  mkdirSync(dir, { recursive: true });

  let previous: RunSummary | null = null;
  if (existsSync(root)) {
    const siblings = readdirSync(root)
      .filter(
        (name) =>
          name !== folder && existsSync(join(root, name, "results.json")),
      )
      .sort();
    const newest = siblings[siblings.length - 1];
    if (newest) {
      previous = JSON.parse(
        readFileSync(join(root, newest, "results.json"), "utf8"),
      ) as RunSummary;
    }
  }

  writeFileSync(join(dir, "results.json"), JSON.stringify(summary, null, 2));
  writeFileSync(join(dir, "report.md"), renderReport(summary, previous));

  for (const input of inputs) {
    const caseDir = join(dir, "cases", input.id);
    mkdirSync(caseDir, { recursive: true });
    if (input.key) {
      writeFileSync(
        join(caseDir, "answer-key.json"),
        JSON.stringify(input.key, null, 2),
      );
    }
    const result = summary.results.find((entry) => entry.id === input.id);
    writeFileSync(
      join(caseDir, "extracted-values.json"),
      JSON.stringify(
        (result?.runs ?? []).map((entry) => ({
          run: entry.run,
          ok: entry.ok,
          message: entry.message ?? null,
          extractedRows: entry.extractedRows ?? null,
          stored: entry.stored ?? [],
        })),
        null,
        2,
      ),
    );
    if (publishInputs) {
      copyFileSync(input.path, join(caseDir, `original${extname(input.path)}`));
    }
  }

  const indexPath = join(root, "INDEX.md");
  if (!existsSync(indexPath)) writeFileSync(indexPath, INDEX_HEADER);
  appendFileSync(indexPath, `${renderIndexLine(summary, folder)}\n`);
  return dir;
}
