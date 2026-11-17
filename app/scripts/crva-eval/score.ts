import {
  CRVA_FIELD_IDS,
  type CrvaDraftBundle,
  type CrvaDraftValue,
} from "@/backend/ingest/plugins/ccra/draft-schema";
import type {
  GoldRow,
  GoldWorkbook,
  Judgment,
  ScoredRow,
  Verdict,
} from "./types";

type Source = CrvaDraftValue["source"];

const V0_FIELDS = new Set(CRVA_FIELD_IDS);

/** Best first; a better verdict wins when several values hit one gold row. */
const VERDICT_RANK: Verdict[] = [
  "Correct",
  "Normalisation",
  "Partial",
  "Unsupported inference",
  "Wrong content",
  "Hallucination",
];

function rank(verdict: Verdict | null): number {
  const i = verdict === null ? -1 : VERDICT_RANK.indexOf(verdict);
  return i === -1 ? VERDICT_RANK.length : i;
}

export function formatModelValue(value: CrvaDraftValue): string {
  const v: unknown = value.value;
  if (typeof v === "string") return v;
  return Object.values(v as Record<string, unknown>)
    .filter((part) => part !== null && part !== undefined)
    .map((part) => (Array.isArray(part) ? part.join(", ") : String(part)))
    .join(" — ");
}

export function formatEvidence(source: Source): string {
  return `p. ${source.page} — "${source.quote}"`;
}

interface Match {
  value: CrvaDraftValue;
  judgment: Judgment;
  index: number;
}

interface Ordered {
  index: number;
  row: ScoredRow;
}

function sortOrdered(items: Ordered[]): ScoredRow[] {
  return items
    .sort(
      (a, b) => a.row.fieldId.localeCompare(b.row.fieldId) || a.index - b.index,
    )
    .map((item) => item.row);
}

export function scoreRun(input: {
  gold: GoldWorkbook;
  bundle: CrvaDraftBundle;
  judgments: Record<string, Judgment[]>;
}): ScoredRow[] {
  const { gold, bundle, judgments } = input;
  const trapPages = new Set<number>();
  // Entries for "all" pages would flag every row, so they are ignored here.
  for (const trap of gold.traps) {
    if (trap.pages !== "all") trap.pages.forEach((p) => trapPages.add(p));
  }
  const figurePages = new Set(bundle.figures.map((f) => f.page));
  const goldRows = [...gold.rows].sort((a, b) => a.rowNumber - b.rowNumber);

  const fieldIds = new Set<string>([
    ...goldRows.map((r) => r.fieldId),
    ...bundle.values.map((v) => v.fieldId),
  ]);

  const goldScored: ScoredRow[] = [];
  // Extras and duplicates carry their value index so the output order is stable.
  const extras: Ordered[] = [];
  const duplicates: Ordered[] = [];

  for (const fieldId of fieldIds) {
    const isV0Field = V0_FIELDS.has(fieldId);
    const values = bundle.values.filter((v) => v.fieldId === fieldId);
    const fieldJudgments = judgments[fieldId] ?? [];
    // An empty list is the same as a field the judge never reached.
    const notJudged =
      isV0Field && fieldJudgments.length === 0 && values.length > 0;
    const rows = goldRows.filter((r) => r.fieldId === fieldId);
    // N/A rows take no value; a match naming one is scored as an extra.
    const fillable = new Map<string, GoldRow[]>();
    for (const row of rows) {
      if (row.status === "N/A") continue;
      fillable.set(row.itemKey, [...(fillable.get(row.itemKey) ?? []), row]);
    }

    const byKey = new Map<string, Match[]>();
    const seen = new Set<number>();
    for (const judgment of fieldJudgments) {
      const value = values[judgment.valueIndex];
      // Bad or repeated indexes are ignored; the value falls to "not judged".
      if (!value || seen.has(judgment.valueIndex)) continue;
      seen.add(judgment.valueIndex);
      const key = judgment.itemKey;
      if (!judgment.goldGap && key !== null && fillable.has(key)) {
        byKey.set(key, [
          ...(byKey.get(key) ?? []),
          { value, judgment, index: judgment.valueIndex },
        ]);
        continue;
      }
      extras.push({
        index: judgment.valueIndex,
        row: extraRow(fieldId, value, judgment, trapPages),
      });
    }
    // Every bundle value must reach the output, judged or not.
    values.forEach((value, index) => {
      if (seen.has(index)) return;
      extras.push({ index, row: unjudgedRow(fieldId, value, trapPages) });
    });

    const filled = new Map<number, Match>();
    for (const [key, matches] of byKey) {
      matches.sort(
        (a, b) =>
          rank(a.judgment.verdict) - rank(b.judgment.verdict) ||
          a.judgment.valueIndex - b.judgment.valueIndex,
      );
      const free = fillable.get(key)!;
      matches.forEach((match, i) => {
        if (i < free.length) {
          filled.set(free[i].rowNumber, match);
          return;
        }
        const { value, judgment } = match;
        duplicates.push({
          index: match.index,
          row: {
            kind: "duplicate",
            rowNumber: null,
            fieldId,
            isV0Field,
            itemKey: key,
            goldStatus: null,
            trap: trapPages.has(value.source.page),
            modelValue: formatModelValue(value),
            modelEvidence: formatEvidence(value.source),
            modelStatus: judgment.modelStatus,
            verdict: null,
            notes: `duplicate of ${key}`,
            reason: judgment.reason,
            uncertain: judgment.uncertain,
          },
        });
      });
    }

    for (const row of rows) {
      const common = {
        kind: "gold" as const,
        rowNumber: row.rowNumber,
        fieldId,
        isV0Field,
        itemKey: row.itemKey,
        goldStatus: row.status,
        trap: row.trapNote || row.pages.some((page) => trapPages.has(page)),
      };
      const match = filled.get(row.rowNumber);
      if (match) {
        goldScored.push({
          ...common,
          modelValue: formatModelValue(match.value),
          modelEvidence: formatEvidence(match.value.source),
          modelStatus: match.judgment.modelStatus,
          verdict: match.judgment.verdict,
          notes: match.judgment.reason,
          reason: match.judgment.reason,
          uncertain: match.judgment.uncertain,
        });
        continue;
      }
      const empty = {
        ...common,
        modelValue: "",
        modelEvidence: "",
        notes: "",
        reason: "",
        uncertain: false,
      };
      if (row.status === "N/A") {
        goldScored.push({ ...empty, modelStatus: "NOT_FOUND", verdict: null });
        continue;
      }
      const unjudged = notJudged
        ? { uncertain: true, reason: "field not judged" }
        : {};
      if (row.status === "NOT_FOUND") {
        goldScored.push({
          ...empty,
          modelStatus: "NOT_FOUND",
          verdict: "Correct (NOT_FOUND)",
          ...unjudged,
        });
        continue;
      }
      // A figure on the row's pages is queued for human review, not read.
      const figurePage = row.pages.find((page) => figurePages.has(page));
      goldScored.push({
        ...empty,
        modelStatus: figurePage === undefined ? "NOT_FOUND" : "PARTIAL",
        verdict: "Omission",
        notes:
          figurePage === undefined
            ? ""
            : `figure listed on p. ${figurePage} for review`,
        ...unjudged,
      });
    }
  }

  goldScored.sort((a, b) => a.rowNumber! - b.rowNumber!);
  return [...goldScored, ...sortOrdered(extras), ...sortOrdered(duplicates)];
}

function extraRow(
  fieldId: string,
  value: CrvaDraftValue,
  judgment: Judgment,
  trapPages: Set<number>,
): ScoredRow {
  let notes = judgment.reason;
  if (judgment.goldGap) notes = "GOLD GAP";
  else if (judgment.verdict === "Misattribution" && judgment.misattributedTo) {
    notes = `belongs in ${judgment.misattributedTo}`;
  }
  return {
    kind: "extra",
    rowNumber: null,
    fieldId,
    isV0Field: V0_FIELDS.has(fieldId),
    itemKey: "",
    goldStatus: null,
    trap: trapPages.has(value.source.page),
    modelValue: formatModelValue(value),
    modelEvidence: formatEvidence(value.source),
    modelStatus: judgment.modelStatus,
    verdict: judgment.goldGap ? null : judgment.verdict,
    notes,
    reason: judgment.reason,
    uncertain: judgment.uncertain,
  };
}

/** A value the judge never covered: kept visible and flagged for review. */
function unjudgedRow(
  fieldId: string,
  value: CrvaDraftValue,
  trapPages: Set<number>,
): ScoredRow {
  return {
    kind: "extra",
    rowNumber: null,
    fieldId,
    isV0Field: V0_FIELDS.has(fieldId),
    itemKey: "",
    goldStatus: null,
    trap: trapPages.has(value.source.page),
    modelValue: formatModelValue(value),
    modelEvidence: formatEvidence(value.source),
    modelStatus: "NOT_FOUND",
    verdict: null,
    notes: "not judged",
    reason: "",
    uncertain: true,
  };
}

const CSV_HEADER = [
  "gold_row",
  "field_id",
  "item_key",
  "model value",
  "model evidence",
  "model status",
  "verdict",
  "eval notes",
];

function csvCell(raw: string): string {
  // A leading apostrophe stops Sheets from evaluating the cell as a formula.
  const text = /^[=+\-@]/.test(raw) ? `'${raw}` : raw;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** The judge's reason follows the label when the label does not already say it. */
function evalNotes(row: ScoredRow): string {
  if (!row.reason || row.notes === row.reason) return row.notes;
  return row.notes ? `${row.notes} — ${row.reason}` : row.reason;
}

/**
 * Columns David pastes next to the Gold tab. Gold notes are never written, so
 * pasting cannot overwrite the annotator's `notes` column.
 */
export function sheetCsv(rows: ScoredRow[]): string {
  const lines = rows.map((row) =>
    [
      row.rowNumber === null ? "" : String(row.rowNumber),
      row.fieldId,
      row.itemKey,
      row.modelValue,
      row.modelEvidence,
      row.goldStatus === "N/A" ? "" : row.modelStatus,
      row.verdict ?? "",
      evalNotes(row),
    ]
      .map(csvCell)
      .join(","),
  );
  return [CSV_HEADER.join(","), ...lines].join("\n") + "\n";
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Uncertain rows first, then a seeded sample of the confident verdicts. */
export function reviewSample(rows: ScoredRow[], seed: number): ScoredRow[] {
  const uncertain = rows.filter((r) => r.uncertain);
  const population = rows.filter(
    (r) => r.verdict !== null && r.verdict !== "Omission" && !r.uncertain,
  );
  const size = Math.min(
    population.length,
    Math.max(30, Math.ceil(population.length * 0.1)),
  );
  const random = mulberry32(seed);
  const order = population.map((_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  const picked = order.slice(0, size).sort((a, b) => a - b);
  return [...uncertain, ...picked.map((i) => population[i])];
}
