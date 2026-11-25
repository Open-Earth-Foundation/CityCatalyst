/**
 * Judge calibration: a stratified sample of judged rows goes to a Claude
 * reviewer, who fills the reviewer columns; `score` then measures how often
 * the reviewer agrees with the GPT judge. Run with
 *   tsx scripts/crva-eval/calibration.ts sample --scored <scored.json> [--seed 1] [--size 40] [--blind]
 *   tsx scripts/crva-eval/calibration.ts score --sample <calibration-sample.csv> [--reviewer <filled calibration-reviewer.csv>]
 * `--blind` also writes calibration-reviewer.csv without the judge columns, so
 * the reviewer is not anchored by the judge's answer.
 * Outputs are written next to the input file.
 */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { parse } from "csv-parse/sync";
import { stringify } from "csv-stringify/sync";
import { mulberry32 } from "./score";
import {
  ERROR_CAUSES,
  PARTIAL_REASONS,
  VERDICTS,
  escapeTableCell,
  type ScoredRow,
} from "./types";

export const AGREEMENT_TARGET = 0.85;
const MIN_PER_VERDICT = 3;
const MIN_UNCERTAIN = 10;
const MIN_PER_EXTRA_KIND = 3;

const GAP_LABEL = "GOLD GAP";
const DUPLICATE_LABEL = "duplicate";

const SAMPLE_HEADER: string[] = [
  "gold_row",
  "field_id",
  "item_key",
  "gold status",
  "gold value",
  "gold evidence",
  "gold pages",
  "model value",
  "model evidence",
  "judge verdict",
  "judge partial reason",
  "judge cause",
  "judge reason",
  "row id",
  "blind id",
  "reviewer verdict",
  "reviewer partial reason",
  "reviewer cause",
  "reviewer note",
];

function isGoldGap(row: ScoredRow): boolean {
  return row.kind === "extra" && row.notes.startsWith(GAP_LABEL);
}

/**
 * What the judge said about the row: a verdict, or GOLD GAP / duplicate. A
 * duplicate shows the judge's own verdict for its value; scored.json files
 * written before judgeVerdict existed fall back to the label.
 */
export function judgeLabel(row: ScoredRow): string {
  if (row.kind === "duplicate") return row.judgeVerdict ?? DUPLICATE_LABEL;
  if (isGoldGap(row)) return GAP_LABEL;
  return row.verdict ?? "";
}

/** Stable id: g<sheet row> for gold rows, e<n> / d<n> by position in scored.json. */
export function rowIds(rows: ScoredRow[]): string[] {
  return rows.map((r, i) =>
    r.kind === "gold"
      ? `g${r.rowNumber}`
      : `${r.kind === "extra" ? "e" : "d"}${i}`,
  );
}

/** Rows a reviewer can meaningfully check: judged, GOLD GAP or duplicate; never N/A or not-judged. */
function eligible(row: ScoredRow): boolean {
  if (row.kind === "gold")
    return row.goldStatus !== "N/A" && row.verdict !== null;
  if (row.kind === "duplicate") return true;
  return isGoldGap(row) || row.verdict !== null;
}

/**
 * Stratified sample: every verdict present, uncertain rows, GOLD GAP and
 * duplicate rows are guaranteed a share; the rest is random. Deterministic
 * for a seed; returned in scored.json order.
 */
export function calibrationSample(
  rows: ScoredRow[],
  seed: number,
  size = 40,
): ScoredRow[] {
  const random = mulberry32(seed);
  const order = rows.map((_, i) => i).filter((i) => eligible(rows[i]));
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  const picked = new Set<number>();
  // Top up a stratum to `wanted` rows, counting rows already picked for it.
  const take = (matches: (r: ScoredRow) => boolean, wanted: number): void => {
    let have = order.filter((i) => picked.has(i) && matches(rows[i])).length;
    for (const i of order) {
      if (have >= wanted) break;
      if (!picked.has(i) && matches(rows[i])) {
        picked.add(i);
        have++;
      }
    }
  };
  for (const verdict of VERDICTS) {
    take((r) => judgeLabel(r) === verdict, MIN_PER_VERDICT);
  }
  take((r) => r.uncertain, MIN_UNCERTAIN);
  take(isGoldGap, MIN_PER_EXTRA_KIND);
  take((r) => r.kind === "duplicate", MIN_PER_EXTRA_KIND);
  for (const i of order) {
    if (picked.size >= size) break;
    picked.add(i);
  }
  return [...picked].sort((a, b) => a - b).map((i) => rows[i]);
}

const JUDGE_COLUMNS = [
  "judge verdict",
  "judge partial reason",
  "judge cause",
  "judge reason",
];
const HIDDEN_FROM_REVIEWER = [...JUDGE_COLUMNS, "row id", "gold_row"];
const REVIEWER_COLUMNS = [
  "reviewer verdict",
  "reviewer partial reason",
  "reviewer cause",
  "reviewer note",
];

function sampleRecords(
  allRows: ScoredRow[],
  sample: ScoredRow[],
): Record<string, string>[] {
  const ids = rowIds(allRows);
  return sample.map((r, i) => ({
    gold_row: String(r.rowNumber ?? ""),
    field_id: r.fieldId,
    item_key: r.itemKey,
    "gold status": r.goldStatus ?? "",
    "gold value": r.goldValue,
    "gold evidence": r.goldEvidence,
    "gold pages": r.goldPages.join(", "),
    "model value": r.modelValue,
    "model evidence": r.modelEvidence,
    "judge verdict": judgeLabel(r),
    "judge partial reason": r.partialReason ?? "",
    "judge cause": r.cause ?? "",
    "judge reason": r.reason,
    "row id": ids[allRows.indexOf(r)],
    "blind id": `r${i + 1}`,
    ...Object.fromEntries(REVIEWER_COLUMNS.map((c) => [c, ""])),
  }));
}

/** The answer key: judge columns filled, reviewer columns left blank. */
export function sampleCsv(allRows: ScoredRow[], sample: ScoredRow[]): string {
  return stringify(sampleRecords(allRows, sample), {
    header: true,
    columns: SAMPLE_HEADER,
  });
}

/** Same rows and order as the key, without the judge columns or anything that reveals the row kind (row id, gold_row), so the reviewer is not anchored. */
export function reviewerCsv(allRows: ScoredRow[], sample: ScoredRow[]): string {
  return stringify(sampleRecords(allRows, sample), {
    header: true,
    columns: SAMPLE_HEADER.filter((c) => !HIDDEN_FROM_REVIEWER.includes(c)),
  });
}

/** Puts the reviewer's columns onto the key rows by blind id; unknown, missing or duplicate ids are errors. */
export function joinReviewer(
  key: Record<string, string>[],
  reviewer: Record<string, string>[],
): Record<string, string>[] {
  const ids = reviewer.map((r) => r["blind id"]);
  const dup = ids.filter((id, i) => ids.indexOf(id) !== i);
  if (dup.length)
    throw new Error(`Duplicate ids in reviewer file: ${dup.join(", ")}`);
  const byId = new Map(reviewer.map((r) => [r["blind id"], r]));
  const keyIds = new Set(key.map((k) => k["blind id"]));
  const unknown = [...byId.keys()].filter((id) => !keyIds.has(id));
  if (unknown.length)
    throw new Error(`Reviewer rows not in the sample: ${unknown.join(", ")}`);
  const missing = [...keyIds].filter((id) => !byId.has(id));
  if (missing.length)
    throw new Error(
      `Sample rows missing from reviewer file: ${missing.join(", ")}`,
    );
  return key.map((k) => ({
    ...k,
    ...Object.fromEntries(
      REVIEWER_COLUMNS.map((c) => [c, byId.get(k["blind id"])?.[c] ?? ""]),
    ),
  }));
}

export interface Disagreement {
  rowId: string;
  field: "verdict" | "partial reason" | "cause";
  judge: string;
  reviewer: string;
  note: string;
}

export interface Agreement {
  reviewed: number;
  agreed: number;
  rate: number | null;
  perVerdict: Record<string, { reviewed: number; agreed: number }>;
  /** confusion[judge label][reviewer verdict] = count */
  confusion: Record<string, Record<string, number>>;
  partial: { both: number; agreed: number };
  cause: { both: number; agreed: number };
  disagreements: Disagreement[];
  /** Reviewer values that are not a known verdict, label, partial reason or cause. */
  unrecognised: { rowId: string; field: string; value: string }[];
}

/** Canonical spelling of a value, or null when it is not one of `allowed`. */
function canonical(value: string, allowed: readonly string[]): string | null {
  const v = value.trim().toLowerCase();
  return allowed.find((a) => a.toLowerCase() === v) ?? null;
}

const VERDICT_LABELS = [...VERDICTS, GAP_LABEL, DUPLICATE_LABEL];

/** Agreement between the judge and the reviewer over the rows the reviewer filled. */
export function agreement(records: Record<string, string>[]): Agreement {
  const out: Agreement = {
    reviewed: 0,
    agreed: 0,
    rate: null,
    perVerdict: {},
    confusion: {},
    partial: { both: 0, agreed: 0 },
    cause: { both: 0, agreed: 0 },
    disagreements: [],
    unrecognised: [],
  };
  for (const rec of records) {
    const judgeRaw = (rec["judge verdict"] ?? "").trim();
    const reviewerRaw = (rec["reviewer verdict"] ?? "").trim();
    if (!reviewerRaw) continue;
    const judge = canonical(judgeRaw, VERDICT_LABELS) ?? judgeRaw;
    const reviewer = canonical(reviewerRaw, VERDICT_LABELS);
    const shown = reviewer ?? reviewerRaw;
    const id = rec["row id"] ?? "";
    const note = rec["reviewer note"] ?? "";
    if (reviewer === null)
      out.unrecognised.push({
        rowId: id,
        field: "verdict",
        value: reviewerRaw,
      });
    const ok = judge === reviewer;
    out.reviewed++;
    if (ok) out.agreed++;
    const stat = (out.perVerdict[judge] ??= { reviewed: 0, agreed: 0 });
    stat.reviewed++;
    if (ok) stat.agreed++;
    const line = (out.confusion[judge] ??= {});
    line[shown] = (line[shown] ?? 0) + 1;
    if (!ok)
      out.disagreements.push({
        rowId: id,
        field: "verdict",
        judge,
        reviewer: shown,
        note,
      });

    // Compare canonical spellings; a reviewer value outside the allowed set disagrees.
    const check = (
      field: "partial reason" | "cause",
      judgeValue: string,
      reviewerValue: string,
      allowed: readonly string[],
      tally: { both: number; agreed: number },
    ) => {
      const r = canonical(reviewerValue, allowed);
      if (r === null && reviewerValue)
        out.unrecognised.push({ rowId: id, field, value: reviewerValue });
      tally.both++;
      if (r !== null && r === canonical(judgeValue, allowed)) tally.agreed++;
      else
        out.disagreements.push({
          rowId: id,
          field,
          judge: judgeValue,
          reviewer: r ?? reviewerValue,
          note,
        });
    };
    const jPartial = (rec["judge partial reason"] ?? "").trim();
    const rPartial = (rec["reviewer partial reason"] ?? "").trim();
    if (judge === "Partial" && reviewer === "Partial")
      check("partial reason", jPartial, rPartial, PARTIAL_REASONS, out.partial);
    const jCause = (rec["judge cause"] ?? "").trim();
    const rCause = (rec["reviewer cause"] ?? "").trim();
    if (jCause && rCause)
      check("cause", jCause, rCause, ERROR_CAUSES, out.cause);
  }
  out.rate = out.reviewed ? out.agreed / out.reviewed : null;
  return out;
}

const pct = (n: number, d: number) =>
  d ? `${((100 * n) / d).toFixed(1)}%` : "n/a";
const cell = (s: string) => escapeTableCell(s).replace(/\r?\n/g, " ");

export function calibrationMarkdown(a: Agreement, blind = false): string {
  const passed = a.rate !== null && a.rate >= AGREEMENT_TARGET;
  const lines = [
    "# Judge calibration",
    "",
    "The reviewer is also an LLM (Claude); this measures agreement between models, not human truth.",
    "",
    blind
      ? "Review mode: verdict-blind (judge verdict, reasons, partial reason and cause hidden; alignment visible)."
      : "Review mode: not blind (the reviewer saw the judge columns, so agreement may be inflated).",
    "",
    `Target: at least ${AGREEMENT_TARGET * 100}% agreement. Result: **${passed ? "PASS" : "FAIL"}**.`,
    "",
    `Overall agreement: ${a.agreed}/${a.reviewed} (${pct(a.agreed, a.reviewed)})`,
    "",
    "## Agreement per judge verdict",
    "",
    "| Judge verdict | Reviewed | Agreed | Agreement |",
    "| --- | --- | --- | --- |",
    ...Object.entries(a.perVerdict).map(
      ([v, s]) =>
        `| ${cell(v)} | ${s.reviewed} | ${s.agreed} | ${pct(s.agreed, s.reviewed)} |`,
    ),
    "",
    "## Confusion (rows: judge, columns: reviewer)",
    "",
  ];
  const columns = [
    ...new Set(Object.values(a.confusion).flatMap((l) => Object.keys(l))),
  ];
  lines.push(
    `| Judge \\ Reviewer | ${columns.map(cell).join(" | ")} |`,
    `| --- | ${columns.map(() => "---").join(" | ")} |`,
    ...Object.entries(a.confusion).map(
      ([j, l]) =>
        `| ${cell(j)} | ${columns.map((c) => l[c] ?? 0).join(" | ")} |`,
    ),
    "",
    "## Partial reason and cause",
    "",
    `- Partial reason agreement (both Partial): ${a.partial.agreed}/${a.partial.both} (${pct(a.partial.agreed, a.partial.both)})`,
    `- Cause agreement (both gave a cause): ${a.cause.agreed}/${a.cause.both} (${pct(a.cause.agreed, a.cause.both)})`,
    "",
    "## Unrecognised reviewer values",
    "",
  );
  if (a.unrecognised.length === 0) lines.push("None.");
  else
    lines.push(
      "These count as disagreements.",
      "",
      ...a.unrecognised.map(
        (u) => `- ${cell(u.rowId)} (${u.field}): ${cell(u.value)}`,
      ),
    );
  lines.push("", "## Disagreements", "");
  if (a.disagreements.length === 0) lines.push("None.");
  else
    lines.push(
      "| Row id | Field | Judge | Reviewer | Reviewer note |",
      "| --- | --- | --- | --- | --- |",
      ...a.disagreements.map(
        (d) =>
          `| ${cell(d.rowId)} | ${d.field} | ${cell(d.judge)} | ${cell(d.reviewer)} | ${cell(d.note)} |`,
      ),
    );
  return lines.join("\n") + "\n";
}

function argValue(flag: string, fallback?: string): string {
  const i = process.argv.indexOf(flag);
  const value = i >= 0 ? process.argv[i + 1] : fallback;
  if (!value) throw new Error(`Missing ${flag}`);
  return value;
}

async function main(): Promise<void> {
  const command = process.argv[2];
  if (command === "sample") {
    const scoredPath = path.resolve(argValue("--scored"));
    const rows = JSON.parse(await readFile(scoredPath, "utf8")) as ScoredRow[];
    const sample = calibrationSample(
      rows,
      Number(argValue("--seed", "1")),
      Number(argValue("--size", "40")),
    );
    const out = path.join(path.dirname(scoredPath), "calibration-sample.csv");
    await writeFile(out, sampleCsv(rows, sample), "utf8");
    console.log(`Wrote ${sample.length} rows to ${out}`);
    if (process.argv.includes("--blind")) {
      const blindOut = path.join(
        path.dirname(scoredPath),
        "calibration-reviewer.csv",
      );
      await writeFile(blindOut, reviewerCsv(rows, sample), "utf8");
      console.log(`Wrote the blind reviewer copy to ${blindOut}`);
    }
  } else if (command === "score") {
    const samplePath = path.resolve(argValue("--sample"));
    const read = async (file: string) =>
      parse(await readFile(file, "utf8"), {
        columns: true,
        skip_empty_lines: true,
        relax_column_count: true,
      }) as Record<string, string>[];
    const reviewerPath = process.argv.includes("--reviewer")
      ? path.resolve(argValue("--reviewer"))
      : null;
    const key = await read(samplePath);
    const records = reviewerPath
      ? joinReviewer(key, await read(reviewerPath))
      : key;
    const result = agreement(records);
    const out = path.join(path.dirname(samplePath), "calibration.md");
    await writeFile(
      out,
      calibrationMarkdown(result, reviewerPath !== null),
      "utf8",
    );
    console.log(
      `Agreement ${pct(result.agreed, result.reviewed)} over ${result.reviewed} rows; wrote ${out}`,
    );
  } else {
    throw new Error("Usage: calibration.ts sample|score ...");
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
