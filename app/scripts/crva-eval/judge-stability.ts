/**
 * Compares two judgings of the same run.
 *
 *   npx tsx scripts/crva-eval/judge-stability.ts --a <score dir> --b <score dir>
 *
 * Reads scored.json (and judge.jsonl, for the judge models) from each score
 * directory and writes judge-stability.md into the parent run directory of --b.
 */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { coverage, precision, summarize } from "./report";
import { modelsFromLog, readLog } from "./score-run";
import type { ScoredRow } from "./types";

const MAX_CHANGED = 50;

export interface ChangedRow {
  id: string;
  fieldId: string;
  verdictA: string;
  verdictB: string;
}

interface FieldStability {
  goldTotal: number;
  goldSame: number;
  valuesTotal: number;
  valuesSame: number;
}

export interface JudgeStability {
  gold: { total: number; sameVerdict: number; sameStatus: number };
  values: {
    matched: number;
    sameVerdict: number;
    onlyA: string[];
    onlyB: string[];
  };
  perField: Record<string, FieldStability>;
  /** Gold rows and extra/duplicate values whose verdict differs; capped. */
  changed: ChangedRow[];
  changedTotal: number;
}

const verdictOf = (r: ScoredRow) => r.verdict ?? "none";
const valueKey = (r: ScoredRow) =>
  JSON.stringify([r.fieldId, r.modelValue, r.modelEvidence]);
const describeValue = (r: ScoredRow) =>
  `${r.fieldId} "${r.modelValue.slice(0, 80)}"`;

const isGoldAnswered = (r: ScoredRow) =>
  r.kind === "gold" &&
  r.rowNumber !== null &&
  r.goldStatus !== null &&
  r.goldStatus !== "N/A";

function byValue(rows: ScoredRow[]): Map<string, ScoredRow> {
  const map = new Map<string, ScoredRow>();
  for (const r of rows) {
    if (r.modelValue !== "" && !map.has(valueKey(r))) map.set(valueKey(r), r);
  }
  return map;
}

export function judgeStability(a: ScoredRow[], b: ScoredRow[]): JudgeStability {
  const perField: Record<string, FieldStability> = {};
  const field = (id: string) =>
    (perField[id] ??= {
      goldTotal: 0,
      goldSame: 0,
      valuesTotal: 0,
      valuesSame: 0,
    });
  const changed: ChangedRow[] = [];
  let changedTotal = 0;
  const noteChange = (change: ChangedRow) => {
    changedTotal++;
    if (changed.length < MAX_CHANGED) changed.push(change);
  };

  // Gold rows are the same in both judgings, so they pair by sheet row.
  const goldB = new Map(
    b.filter(isGoldAnswered).map((r) => [r.rowNumber as number, r]),
  );
  const gold = { total: 0, sameVerdict: 0, sameStatus: 0 };
  for (const ra of a.filter(isGoldAnswered)) {
    const rb = goldB.get(ra.rowNumber as number);
    if (!rb) continue;
    gold.total++;
    const same = ra.verdict === rb.verdict;
    if (same) gold.sameVerdict++;
    else {
      noteChange({
        id: `row ${ra.rowNumber}`,
        fieldId: ra.fieldId,
        verdictA: verdictOf(ra),
        verdictB: verdictOf(rb),
      });
    }
    if (ra.modelStatus === rb.modelStatus) gold.sameStatus++;
    if (ra.isV0Field) {
      const f = field(ra.fieldId);
      f.goldTotal++;
      if (same) f.goldSame++;
    }
  }

  const valuesA = byValue(a);
  const valuesB = byValue(b);
  const values = {
    matched: 0,
    sameVerdict: 0,
    onlyA: [] as string[],
    onlyB: [] as string[],
  };
  for (const [key, ra] of valuesA) {
    const rb = valuesB.get(key);
    if (!rb) {
      values.onlyA.push(describeValue(ra));
      continue;
    }
    values.matched++;
    const same = ra.verdict === rb.verdict;
    if (same) values.sameVerdict++;
    // Gold rows were already listed above.
    else if (ra.kind !== "gold") {
      noteChange({
        id: `${ra.kind} ${ra.fieldId}/${ra.itemKey}`,
        fieldId: ra.fieldId,
        verdictA: verdictOf(ra),
        verdictB: verdictOf(rb),
      });
    }
    if (ra.isV0Field) {
      const f = field(ra.fieldId);
      f.valuesTotal++;
      if (same) f.valuesSame++;
    }
  }
  for (const [key, rb] of valuesB) {
    if (!valuesA.has(key)) values.onlyB.push(describeValue(rb));
  }
  return { gold, values, perField, changed, changedTotal };
}

const pct = (hits: number, total: number) =>
  total === 0 ? "n/a" : `${((hits / total) * 100).toFixed(1)}%`;
const share = (hits: number, total: number) =>
  `${hits} of ${total} (${pct(hits, total)})`;
const cell = (s: string) => s.replace(/\|/g, "\\|").replace(/\s+/g, " ");

export function judgeStabilityMarkdown(
  a: ScoredRow[],
  b: ScoredRow[],
  models: { a: string[]; b: string[] },
): string {
  const s = judgeStability(a, b);
  const headline = (rows: ScoredRow[]) => {
    const c = coverage(rows).fullDetail;
    const p = precision(rows).fullDetail;
    return [
      `${(summarize(rows).shareCorrect * 100).toFixed(1)}%`,
      share(c.hits, c.total),
      share(p.hits, p.total),
    ];
  };
  const [ha, hb] = [headline(a), headline(b)];
  const names = (m: string[]) => (m.length > 0 ? m.join(", ") : "unknown");
  const lines = [
    "# Judge stability",
    "",
    `Judge model, run A: ${names(models.a)}. Run B: ${names(models.b)}.`,
    "",
    "gpt-5.6-sol does not accept temperature 0; no seed is sent; differences are judge randomness.",
    "",
    "## Headline numbers",
    "",
    "| Measure | A | B |",
    "| --- | --- | --- |",
    `| Share correct (ticket formula) | ${ha[0]} | ${hb[0]} |`,
    `| Coverage, full detail | ${ha[1]} | ${hb[1]} |`,
    `| Precision, full detail | ${ha[2]} | ${hb[2]} |`,
    "",
    "## Agreement",
    "",
    `- Gold rows with the same verdict: ${share(s.gold.sameVerdict, s.gold.total)}`,
    `- Gold rows with the same model status: ${share(s.gold.sameStatus, s.gold.total)}`,
    `- Model values (field, value, evidence) in both judgings with the same verdict: ${share(s.values.sameVerdict, s.values.matched)}`,
    `- Values only in A: ${s.values.onlyA.length}; only in B: ${s.values.onlyB.length} (the judge aligned them differently)`,
    "",
    "## Per field (v0)",
    "",
    "| Field | Gold rows, same verdict | Values, same verdict |",
    "| --- | --- | --- |",
    ...Object.entries(s.perField)
      .sort(([x], [y]) => x.localeCompare(y))
      .map(
        ([id, f]) =>
          `| ${id} | ${share(f.goldSame, f.goldTotal)} | ${share(f.valuesSame, f.valuesTotal)} |`,
      ),
    "",
  ];
  for (const [label, list] of [
    ["Values only in A", s.values.onlyA],
    ["Values only in B", s.values.onlyB],
  ] as const) {
    if (list.length === 0) continue;
    lines.push(`## ${label}`, "", ...list.map((v) => `- ${cell(v)}`), "");
  }
  lines.push(
    `## Changed rows (${Math.min(s.changedTotal, MAX_CHANGED)} of ${s.changedTotal})`,
    "",
  );
  if (s.changed.length === 0) lines.push("None.", "");
  else {
    lines.push(
      "| Row | Field | Verdict |",
      "| --- | --- | --- |",
      ...s.changed.map(
        (c) =>
          `| ${cell(c.id)} | ${c.fieldId} | ${c.verdictA} -> ${c.verdictB} |`,
      ),
      "",
    );
  }
  return lines.join("\n");
}

function argValue(flag: string): string {
  const i = process.argv.indexOf(flag);
  const value = i >= 0 ? process.argv[i + 1] : undefined;
  if (!value) throw new Error(`Missing ${flag}`);
  return value;
}

async function readSide(dir: string) {
  const rows = JSON.parse(
    await readFile(path.join(dir, "scored.json"), "utf8"),
  ) as ScoredRow[];
  const log = await readLog(path.join(dir, "judge.jsonl"));
  return { rows, models: modelsFromLog(log ?? []) };
}

async function main() {
  const dirA = argValue("--a");
  const dirB = argValue("--b");
  const [sideA, sideB] = [await readSide(dirA), await readSide(dirB)];
  const out = path.join(path.dirname(path.resolve(dirB)), "judge-stability.md");
  await writeFile(
    out,
    judgeStabilityMarkdown(sideA.rows, sideB.rows, {
      a: sideA.models,
      b: sideB.models,
    }),
  );
  console.log(`Wrote ${out}`);
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
