import { CRVA_FIELD_IDS } from "@/backend/ingest/plugins/ccra/draft-schema";
import type { RunStats } from "./run-adapter";
import {
  MODEL_STATUSES,
  VERDICTS,
  type GoldWorkbook,
  type ModelStatus,
  type ScoredRow,
  type Verdict,
} from "./types";

export type ReportRunStats = RunStats;

export interface ScoreSummary {
  scored: number;
  shareCorrect: number;
  verdictCounts: Record<Verdict, number>;
  statusMatrix: Record<ModelStatus, Record<ModelStatus, number>>;
  statusMatchRate: number;
}

const THRESHOLDS = { maxDropped: 0.05, minFields: 10, minCorrect: 0.8 };

/** Share correct follows the Summary tab: rows with any verdict are the denominator. */
export function summarize(
  rows: ScoredRow[],
  filter: (r: ScoredRow) => boolean = () => true,
): ScoreSummary {
  const verdictCounts = Object.fromEntries(
    VERDICTS.map((v) => [v, 0]),
  ) as Record<Verdict, number>;
  const statusMatrix = Object.fromEntries(
    MODEL_STATUSES.map((g) => [
      g,
      Object.fromEntries(MODEL_STATUSES.map((m) => [m, 0])),
    ]),
  ) as Record<ModelStatus, Record<ModelStatus, number>>;

  let scored = 0;
  let matrixTotal = 0;
  let diagonal = 0;
  for (const row of rows.filter(filter)) {
    if (row.verdict !== null) {
      scored++;
      verdictCounts[row.verdict]++;
    }
    // Only gold rows with a gold status to compare against.
    if (row.kind === "gold" && row.goldStatus && row.goldStatus !== "N/A") {
      statusMatrix[row.goldStatus][row.modelStatus]++;
      matrixTotal++;
      if (row.goldStatus === row.modelStatus) diagonal++;
    }
  }
  const correct = verdictCounts.Correct + verdictCounts["Correct (NOT_FOUND)"];
  return {
    scored,
    shareCorrect: scored === 0 ? 0 : correct / scored,
    verdictCounts,
    statusMatrix,
    statusMatchRate: matrixTotal === 0 ? 0 : diagonal / matrixTotal,
  };
}

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;

function summaryBlock(s: ScoreSummary): string {
  const verdictRows = VERDICTS.map((v) => `| ${v} | ${s.verdictCounts[v]} |`);
  const matrixRows = MODEL_STATUSES.map(
    (g) =>
      `| ${g} | ${MODEL_STATUSES.map((m) => s.statusMatrix[g][m]).join(" | ")} |`,
  );
  return [
    `Scored rows: ${s.scored}. Share correct: ${pct(s.shareCorrect)}. Status match rate: ${pct(s.statusMatchRate)}.`,
    "",
    "| Verdict | Rows |",
    "| --- | --- |",
    ...verdictRows,
    "",
    `| Gold status \ model status | ${MODEL_STATUSES.join(" | ")} |`,
    `| --- | ${MODEL_STATUSES.map(() => "---").join(" | ")} |`,
    ...matrixRows,
  ].join("\n");
}

function check(label: string, ok: boolean, detail: string): string {
  return `| ${label} | ${detail} | ${ok ? "pass" : "fail"} |`;
}

export function buildReport(input: {
  city: string;
  rows: ScoredRow[];
  gold: GoldWorkbook;
  stats: RunStats;
  judgeModel?: string;
  extractionModel?: string;
  /** Fields whose judge call failed twice; the scorer marks them not judged. */
  failedFields?: string[];
}): string {
  const { city, rows, gold, stats } = input;
  const overall = summarize(rows);
  const v0 = summarize(rows, (r) => r.isV0Field);
  const other = summarize(rows, (r) => !r.isV0Field);

  const total = stats.valuesKept + stats.valuesDropped;
  const droppedShare = total === 0 ? 0 : stats.valuesDropped / total;

  const trapRows = rows.filter((r) => r.trap);
  const trapSummary = summarize(trapRows);
  const trapLines = gold.traps.map(
    (t) =>
      `- ${t.pages === "all" ? "all pages" : `p. ${t.pages.join(", ")}`}: ${t.what} (${t.why})`,
  );

  const perField = CRVA_FIELD_IDS.map((id) => {
    const s = summarize(rows, (r) => r.fieldId === id);
    return `| ${id} | ${s.scored} | ${pct(s.shareCorrect)} |`;
  });

  const uncertain = rows.filter((r) => r.uncertain).length;
  const duplicates = rows.filter((r) => r.kind === "duplicate").length;
  const goldGaps = rows.filter((r) => r.notes === "GOLD GAP").length;
  const notJudged = rows.filter(
    (r) => r.notes === "not judged" || r.reason === "field not judged",
  ).length;

  return (
    [
      `# CRVA eval report: ${city}`,
      "",
      "Verdict definitions are provisional: they come from the xlsx and the ticket, pending the answer key doc.",
      "",
      "## Overall",
      "",
      summaryBlock(overall),
      "",
      `## v0 fields (${CRVA_FIELD_IDS.length})`,
      "",
      summaryBlock(v0),
      "",
      "| Field | Scored rows | Share correct |",
      "| --- | --- | --- |",
      ...perField,
      "",
      "## Other fields (34)",
      "",
      summaryBlock(other),
      "",
      "## Traps",
      "",
      ...trapLines,
      "",
      `Rows on trap pages: ${trapRows.length}, scored ${trapSummary.scored}, share correct ${pct(trapSummary.shareCorrect)}.`,
      "",
      "## Thresholds",
      "",
      "| Threshold | Result | Status |",
      "| --- | --- | --- |",
      check(
        "Dropped values under 5%",
        droppedShare < THRESHOLDS.maxDropped,
        pct(droppedShare),
      ),
      check(
        `At least ${THRESHOLDS.minFields} of ${CRVA_FIELD_IDS.length} v0 fields with a value`,
        stats.fieldsWithValue >= THRESHOLDS.minFields,
        String(stats.fieldsWithValue),
      ),
      check(
        "At least 80% correct",
        overall.shareCorrect >= THRESHOLDS.minCorrect,
        pct(overall.shareCorrect),
      ),
      "",
      "## Run",
      "",
      `- Judge model: ${input.judgeModel ?? "unknown"}`,
      `- Extraction model: ${input.extractionModel ?? "unknown"}`,
      `- Run ${stats.run}: ${stats.status}, ${stats.minutes} min, ${stats.parts} parts, ${stats.llmCalls} LLM calls`,
      `- Values kept: ${stats.valuesKept}, dropped: ${stats.valuesDropped}`,
      `- Fields with a value: ${stats.fieldsWithValue} of ${CRVA_FIELD_IDS.length}`,
      `- Uncertain rows: ${uncertain}`,
      `- Duplicates: ${duplicates}`,
      `- GOLD GAP rows: ${goldGaps}`,
      `- Not judged rows: ${notJudged}`,
      `- Fields not judged (judge call failed twice): ${input.failedFields?.length ? input.failedFields.join(", ") : "none"}`,
    ].join("\n") + "\n"
  );
}
