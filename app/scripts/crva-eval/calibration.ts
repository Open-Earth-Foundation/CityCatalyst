/**
 * Judge calibration: a stratified sample of judged rows goes to a Claude
 * reviewer, who fills the reviewer columns; `score` then measures how often
 * the reviewer agrees with the GPT judge. Run with
 *   tsx scripts/crva-eval/calibration.ts sample --scored <scored.json> [--seed 1] [--size 40]
 *   tsx scripts/crva-eval/calibration.ts score --sample <calibration-sample.csv>
 * Outputs are written next to the input file.
 */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { parse } from "csv-parse/sync";
import { stringify } from "csv-stringify/sync";
import { mulberry32 } from "./score";
import { VERDICTS, type ScoredRow } from "./types";

export const AGREEMENT_TARGET = 0.85;
const MIN_PER_VERDICT = 3;
const MIN_UNCERTAIN = 10;
const MIN_PER_EXTRA_KIND = 3;

const GAP_LABEL = "GOLD GAP";
const DUPLICATE_LABEL = "duplicate";

const SAMPLE_HEADER = [
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
  "reviewer verdict",
  "reviewer partial reason",
  "reviewer cause",
  "reviewer note",
];

function isGoldGap(row: ScoredRow): boolean {
  return row.kind === "extra" && row.notes.startsWith(GAP_LABEL);
}

/** What the judge said about the row: a verdict, or GOLD GAP / duplicate. */
export function judgeLabel(row: ScoredRow): string {
  if (row.kind === "duplicate") return DUPLICATE_LABEL;
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

/** The sample CSV: judge columns filled, reviewer columns left blank. */
export function sampleCsv(allRows: ScoredRow[], sample: ScoredRow[]): string {
  const ids = rowIds(allRows);
  const records = sample.map((r) => [
    r.rowNumber ?? "",
    r.fieldId,
    r.itemKey,
    r.goldStatus ?? "",
    r.goldValue,
    r.goldEvidence,
    r.goldPages.join(", "),
    r.modelValue,
    r.modelEvidence,
    judgeLabel(r),
    r.partialReason ?? "",
    r.cause ?? "",
    r.reason,
    ids[allRows.indexOf(r)],
    "",
    "",
    "",
    "",
  ]);
  return stringify([SAMPLE_HEADER, ...records]);
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
}

const same = (a: string, b: string) =>
  a.trim().toLowerCase() === b.trim().toLowerCase();

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
  };
  for (const rec of records) {
    const judge = (rec["judge verdict"] ?? "").trim();
    const reviewer = (rec["reviewer verdict"] ?? "").trim();
    if (!reviewer) continue;
    const id = rec["row id"] ?? "";
    const note = rec["reviewer note"] ?? "";
    const ok = same(judge, reviewer);
    out.reviewed++;
    if (ok) out.agreed++;
    const stat = (out.perVerdict[judge] ??= { reviewed: 0, agreed: 0 });
    stat.reviewed++;
    if (ok) stat.agreed++;
    const line = (out.confusion[judge] ??= {});
    line[reviewer] = (line[reviewer] ?? 0) + 1;
    if (!ok)
      out.disagreements.push({
        rowId: id,
        field: "verdict",
        judge,
        reviewer,
        note,
      });

    const jPartial = (rec["judge partial reason"] ?? "").trim();
    const rPartial = (rec["reviewer partial reason"] ?? "").trim();
    if (same(judge, "Partial") && same(reviewer, "Partial")) {
      out.partial.both++;
      if (same(jPartial, rPartial)) out.partial.agreed++;
      else
        out.disagreements.push({
          rowId: id,
          field: "partial reason",
          judge: jPartial,
          reviewer: rPartial,
          note,
        });
    }
    const jCause = (rec["judge cause"] ?? "").trim();
    const rCause = (rec["reviewer cause"] ?? "").trim();
    if (jCause && rCause) {
      out.cause.both++;
      if (same(jCause, rCause)) out.cause.agreed++;
      else
        out.disagreements.push({
          rowId: id,
          field: "cause",
          judge: jCause,
          reviewer: rCause,
          note,
        });
    }
  }
  out.rate = out.reviewed ? out.agreed / out.reviewed : null;
  return out;
}

const pct = (n: number, d: number) =>
  d ? `${((100 * n) / d).toFixed(1)}%` : "n/a";
const cell = (s: string) => s.replace(/\|/g, "\\|").replace(/\r?\n/g, " ");

export function calibrationMarkdown(a: Agreement): string {
  const passed = a.rate !== null && a.rate >= AGREEMENT_TARGET;
  const lines = [
    "# Judge calibration",
    "",
    "The reviewer is also an LLM (Claude); this measures agreement between models, not human truth.",
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
    "## Disagreements",
    "",
  );
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
  } else if (command === "score") {
    const samplePath = path.resolve(argValue("--sample"));
    const records = parse(await readFile(samplePath, "utf8"), {
      columns: true,
      skip_empty_lines: true,
      relax_column_count: true,
    }) as Record<string, string>[];
    const result = agreement(records);
    const out = path.join(path.dirname(samplePath), "calibration.md");
    await writeFile(out, calibrationMarkdown(result), "utf8");
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
