import { ADAPTER_TO_GOLD_FIELD, formatPartPages, goldFieldId } from "./types";
import { CRVA_FIELD_IDS } from "@/backend/ingest/plugins/ccra/draft-schema";
import type { RunStats } from "./run-adapter";
import { citedPage, GOLD_GAP, NOT_JUDGED } from "./score";
import {
  ERROR_CAUSES,
  MODEL_STATUSES,
  NO_CAUSE_VERDICTS,
  PARTIAL_REASONS,
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

// Aliased rows add "; adapter field <id>" after the label.
const notJudged = (r: ScoredRow) => r.notes.startsWith(NOT_JUDGED);
const goldGap = (r: ScoredRow) => r.notes.startsWith(GOLD_GAP);

type Rate = { hits: number; total: number };
const rate = ({ hits, total }: Rate) =>
  `${hits} of ${total} (${pct(total === 0 ? 0 : hits / total)})`;

const lessDetail = (r: ScoredRow) =>
  r.verdict === "Partial" && r.partialReason === "less_detail";

const TOLERANT = "tolerant view, not the official rule (pending Magdalena)";

/**
 * Coverage: of the gold rows with a gold status, how many the model found.
 * Strict counts Correct and Correct (NOT_FOUND); tolerant adds Partial rows
 * that only lack detail.
 */
export function coverage(rows: ScoredRow[]): { strict: Rate; tolerant: Rate } {
  const gold = rows.filter(
    (r) => r.kind === "gold" && r.goldStatus && r.goldStatus !== "N/A",
  );
  const strict = gold.filter(
    (r) => r.verdict === "Correct" || r.verdict === "Correct (NOT_FOUND)",
  ).length;
  const total = gold.length;
  return {
    strict: { hits: strict, total },
    tolerant: { hits: strict + gold.filter(lessDetail).length, total },
  };
}

/**
 * Precision: of every value the adapter returned (gold-filling rows, extras,
 * duplicates, values the judge never covered), how many are right. Strict
 * counts Correct and Normalisation; tolerant adds Partial with less_detail.
 */
export function precision(rows: ScoredRow[]): { strict: Rate; tolerant: Rate } {
  const bundle = rows.filter((r) => r.modelValue !== "");
  const strict = bundle.filter(
    (r) => r.verdict === "Correct" || r.verdict === "Normalisation",
  ).length;
  const total = bundle.length;
  return {
    strict: { hits: strict, total },
    tolerant: { hits: strict + bundle.filter(lessDetail).length, total },
  };
}

function measuresBlock(rows: ScoredRow[]): string {
  const c = coverage(rows);
  const p = precision(rows);
  return [
    `Coverage, strict: ${rate(c.strict)} gold rows found.`,
    `Coverage, tolerant (${TOLERANT}): ${rate(c.tolerant)}.`,
    `Precision, strict: ${rate(p.strict)} model values right (Correct or Normalisation); comparable to the Madrid hand review (71%).`,
    `Precision, tolerant (${TOLERANT}): ${rate(p.tolerant)}.`,
  ].join("\n\n");
}

/** Count table; rows from an older judge log carry no field and show as not recorded. */
function countTable(
  title: string,
  values: (string | null | undefined)[],
  order: readonly string[],
): string {
  const counts = new Map<string, number>();
  for (const v of values) {
    const key = v === undefined ? "(not recorded)" : (v ?? "(none)");
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const keys = [...order, "(none)", "(not recorded)"];
  return [
    `| ${title} | Rows |`,
    "| --- | --- |",
    ...keys.map((k) => `| ${k} | ${counts.get(k) ?? 0} |`),
  ].join("\n");
}

/** Partial reasons over Partial rows; causes over rows with an error verdict. */
function reasonTables(rows: ScoredRow[]): string {
  const partial = rows.filter((r) => r.verdict === "Partial");
  const errors = rows.filter(
    (r) => r.verdict !== null && !NO_CAUSE_VERDICTS.includes(r.verdict),
  );
  return [
    countTable(
      "Partial reason",
      partial.map((r) => r.partialReason),
      PARTIAL_REASONS,
    ),
    "",
    countTable(
      "Cause (error verdicts)",
      errors.map((r) => r.cause),
      ERROR_CAUSES,
    ),
  ].join("\n");
}

/** "rows 33 Correct, 35 Omission": gold rows and their verdicts. */
function rowVerdicts(rows: ScoredRow[]): string {
  return `rows ${rows.map((r) => `${r.rowNumber} ${r.verdict ?? "no verdict"}`).join(", ")}`;
}

function trapLines(rows: ScoredRow[], gold: GoldWorkbook): string[] {
  const goldRows = rows
    .filter((r) => r.kind === "gold")
    .sort((a, b) => a.rowNumber! - b.rowNumber!);
  const lines = gold.traps.map((t) => {
    if (t.pages === "all") {
      return `- all pages: ${t.what} (${t.why}): applies to all pages`;
    }
    const pages = new Set(t.pages);
    const onPages = goldRows.filter((r) =>
      r.goldPages.some((p) => pages.has(p)),
    );
    const citing = rows.filter((r) => {
      const page = r.modelValue ? citedPage(r) : null;
      return page !== null && pages.has(page);
    }).length;
    const list = onPages.length
      ? rowVerdicts(onPages)
      : "no gold rows on these pages";
    return `- p. ${t.pages.join(", ")}: ${t.what} (${t.why}): ${list}; ${citing} model values cite these pages`;
  });
  const noted = new Set(
    gold.rows.filter((r) => r.trapNote).map((r) => r.rowNumber),
  );
  const notedRows = goldRows.filter((r) => noted.has(r.rowNumber!));
  return [
    ...lines,
    "",
    `Rows with a TRAP: note: ${notedRows.length ? rowVerdicts(notedRows) : "none"}.`,
  ];
}

function summaryBlock(s: ScoreSummary, warning?: string): string {
  const verdictRows = VERDICTS.map((v) => `| ${v} | ${s.verdictCounts[v]} |`);
  const matrixRows = MODEL_STATUSES.map(
    (g) =>
      `| ${g} | ${MODEL_STATUSES.map((m) => s.statusMatrix[g][m]).join(" | ")} |`,
  );
  return [
    `Scored rows: ${s.scored}. Share correct (ticket formula, the DoD measure): ${pct(s.shareCorrect)}. Status match rate: ${pct(s.statusMatchRate)}.`,
    ...(warning ? ["", warning] : []),
    "",
    "| Verdict | Rows |",
    "| --- | --- |",
    ...verdictRows,
    "",
    `| Gold status (rows) / model status (columns) | ${MODEL_STATUSES.join(" | ")} |`,
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
  /** The JUDGE_MODEL value now; compared with the models in the log. */
  judgeModel?: string;
  /** Models recorded in the judge log lines that produced the judgments. */
  judgeModels?: string[];
  extractionModel?: string;
  /** Fields whose judge call failed twice; the scorer marks them not judged. */
  failedFields?: string[];
}): string {
  const { city, rows, gold, stats } = input;
  const v0Ids = new Set<string>([
    ...CRVA_FIELD_IDS,
    ...Object.values(ADAPTER_TO_GOLD_FIELD),
  ]);
  const overall = summarize(rows);
  const v0 = summarize(rows, (r) => r.isV0Field);
  const other = summarize(rows, (r) => !r.isV0Field);

  const total = stats.valuesKept + stats.valuesDropped;
  const droppedShare = total === 0 ? 0 : stats.valuesDropped / total;

  const trapRows = rows.filter((r) => r.trap);
  const trapSummary = summarize(trapRows);

  const perField = CRVA_FIELD_IDS.map((id) => {
    const gid = goldFieldId(id);
    const s = summarize(rows, (r) => r.fieldId === id || r.fieldId === gid);
    const label = gid === id ? id : `${id} (gold ${gid})`;
    return `| ${label} | ${s.scored} | ${pct(s.shareCorrect)} |`;
  });

  const usedModels = input.judgeModels?.length
    ? input.judgeModels
    : input.judgeModel
      ? [input.judgeModel]
      : [];
  const modelMismatch =
    input.judgeModel !== undefined &&
    usedModels.some((m) => m !== input.judgeModel);
  const notJudgedFields = input.failedFields ?? [];
  const otherFieldCount = new Set(
    gold.rows.map((r) => r.fieldId).filter((id) => !v0Ids.has(id)),
  ).size;

  const uncertain = rows.filter((r) => r.uncertain).length;
  const duplicates = rows.filter((r) => r.kind === "duplicate").length;
  const goldGaps = rows.filter(goldGap).length;
  const notJudgedRows = rows.filter(
    (r) => notJudged(r) || r.reason === "field not judged",
  ).length;
  const v0Rows = rows.filter((r) => r.isV0Field);

  return (
    [
      `# CRVA eval report: ${city}`,
      "",
      "Verdict definitions are provisional: they come from the xlsx and the ticket, pending the answer key doc.",
      "",
      "Coverage = gold rows found; precision = model values that are right.",
      "",
      "## Overall",
      "",
      summaryBlock(
        overall,
        notJudgedFields.length > 0
          ? `Fields not judged: ${notJudgedFields.join(", ")}; their gold rows count as Omission / Correct (NOT_FOUND) and are marked uncertain.`
          : undefined,
      ),
      "",
      measuresBlock(rows),
      "",
      reasonTables(rows),
      "",
      `## v0 fields (${CRVA_FIELD_IDS.length})`,
      "",
      summaryBlock(v0),
      "",
      measuresBlock(v0Rows),
      "",
      reasonTables(v0Rows),
      "",
      "| Field | Scored rows | Share correct |",
      "| --- | --- | --- |",
      ...perField,
      "",
      `## Other fields (${otherFieldCount})`,
      "",
      summaryBlock(other),
      "",
      "## Traps",
      "",
      "Traps are keyed by page, not by item_key: a gold row is listed under an entry when one of its gold pages is on the entry's pages.",
      "",
      ...trapLines(rows, gold),
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
      // The adapter is judged on its own 12 fields; the other fields have no
      // model values, so the overall share mostly measures the gold's size.
      check(
        "At least 80% correct (v0 fields)",
        v0.shareCorrect >= THRESHOLDS.minCorrect,
        `${pct(v0.shareCorrect)} v0; overall ${pct(overall.shareCorrect)}`,
      ),
      "",
      "## Run",
      "",
      `- Judge model: ${usedModels.length ? usedModels.join(", ") : "unknown"}`,
      ...(modelMismatch
        ? [
            `- Warning: judgments in the log came from ${usedModels.join(", ")}, but JUDGE_MODEL is now ${input.judgeModel}.`,
          ]
        : []),
      `- Field aliases: ${Object.entries(ADAPTER_TO_GOLD_FIELD)
        .map(([a, g]) => `${a} -> ${g}`)
        .join(", ")}`,
      `- Extraction model: ${input.extractionModel ?? "unknown"}`,
      `- Run ${stats.run}: ${stats.status}, ${stats.minutes} min, ${stats.parts} parts, ${stats.llmCalls} LLM calls`,
      `- Part pages: ${stats.partRanges?.length ? formatPartPages(stats.partRanges) : "part pages not recorded"}`,
      `- Values kept: ${stats.valuesKept}, dropped: ${stats.valuesDropped}`,
      `- Fields with a value: ${stats.fieldsWithValue} of ${CRVA_FIELD_IDS.length}`,
      `- Uncertain rows: ${uncertain}`,
      `- Duplicates: ${duplicates}`,
      `- GOLD GAP rows: ${goldGaps}`,
      `- Not judged rows: ${notJudgedRows}`,
      `- Fields not judged (judge call failed twice): ${input.failedFields?.length ? input.failedFields.join(", ") : "none"}`,
    ].join("\n") + "\n"
  );
}
