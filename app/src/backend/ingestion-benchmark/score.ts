/**
 * Row-level scoring for the GHGI PDF import benchmark.
 *
 * Implements the matching rules of the Product answer-key workbook
 * (GHGI_PDF_answer_keys): a stored row matches a key row when the value is
 * equal within the file tolerance and the GPC ref and scope are equal; rows the
 * source does not split are compared as sums; several key rows with the same
 * ref and scope are compared as one sum; "not in total" values must be stored
 * but stay out of the total; notation keys are scored only when marked.
 *
 * The app stores one InventoryValue per GPC reference and scope, so a "stored
 * row" here is one stored (ref, scope) group, not one extracted line item.
 */
import {
  rowTolerance,
  totalTolerance,
} from "@/backend/ingestion-benchmark/tolerance";
import { toCanonical } from "@/util/notation-keys";
import type {
  KeyFile,
  KeyRow,
} from "@/backend/ingestion-benchmark/answer-keys";
import {
  PDF_PROFILE,
  type ScoringProfile,
} from "@/backend/ingestion-benchmark/profiles";

export type StoredValue = {
  gpc: string;
  scope: string | null;
  /** tonnes CO2e */
  valueT: number;
  /** stored but excluded from the inventory total (for example I.4.4) */
  omit: boolean;
  /** canonical notation key when the row stores a notation key instead of a value */
  notation: string | null;
};

export type FileScore = {
  keyValueRows: number;
  storedGroups: number;
  matchedRows: number;
  rowRecall: number | null;
  rowPrecision: number | null;
  /** Diagnostic: key rows whose subsector sum (all scopes) matches, ignoring the scope split. */
  subsectorRecall: number | null;
  valueAccuracy: number | null;
  classificationAccuracy: number | null;
  expectedTotal: number | null;
  storedTotal: number;
  totalDiffPct: number | null;
  totalWithinTolerance: boolean | null;
  /** "rule" when the printed-precision rule set the row tolerance, else "legacy". */
  toleranceSource: "rule" | "legacy";
  notationScored: number;
  notationRecovered: number;
  distractorsStored: {
    valueT: number;
    gpc: string;
    what: string;
    failureMode: string;
  }[];
  unexpectedStored: { gpc: string; scope: string | null; valueT: number }[];
  missingRows: { description: string; gpc: string; value: number | null }[];
};

const REF_PATTERN = /\b(?:VI|IV|V|III|II|I)(?:\.(?:\d+|x))+/g;

type ParsedRefs = { refs: string[]; alternates: string[] };

export function parseRefs(gpc: string): ParsedRefs {
  const open = gpc.indexOf("(");
  const main = open >= 0 ? gpc.slice(0, open) : gpc;
  const inside = open >= 0 ? gpc.slice(open) : "";
  const mainRefs = main.match(REF_PATTERN) ?? [];
  const insideRefs = inside.match(REF_PATTERN) ?? [];
  return mainRefs.length > 0
    ? { refs: mainRefs, alternates: insideRefs }
    : { refs: insideRefs, alternates: [] };
}

/** A subsector-level ref such as "I.1": its stored refs are "I.1.1", "I.1.2", ... */
const SUBSECTOR_REF = /^(?:I|II|III)\.\d+$/;

function refMatches(
  pattern: string,
  ref: string,
  parentRefMatchesChildren = true,
): boolean {
  if (parentRefMatchesChildren && SUBSECTOR_REF.test(pattern)) {
    return pattern === ref || ref.startsWith(`${pattern}.`);
  }
  if (!pattern.includes(".x")) return pattern === ref;
  const prefix = pattern.slice(0, pattern.indexOf(".x") + 1);
  const tail = pattern.slice(pattern.indexOf(".x") + 2);
  if (!ref.startsWith(prefix)) return false;
  if (!tail) return true;
  return ref.endsWith(tail);
}

function normalizeScope(scope: string | null | undefined): string {
  if (scope === null || scope === undefined) return "";
  const value = String(scope).trim();
  const number = Number(value);
  return Number.isFinite(number) && value !== ""
    ? String(Math.trunc(number))
    : value;
}

/** References outside BASIC and BASIC+: I.4.4, III.x.3 and VI.1. */
export function isGpcExcluded(ref: string): boolean {
  return ref === "I.4.4" || ref === "VI.1" || /^III\.(?:\d+|x)\.3$/.test(ref);
}

const ratio = (num: number, den: number): number | null =>
  den > 0 ? num / den : null;

export function scoreFile(
  file: KeyFile,
  stored: StoredValue[],
  profile: ScoringProfile = PDF_PROFILE,
): FileScore {
  const tolOf = (value: number | null) =>
    profile.valueTolerance(file, value ?? 0);
  const matchesRef = (pattern: string, ref: string) =>
    refMatches(pattern, ref, profile.parentRefMatchesChildren);
  const allValueRows = file.rows.filter(
    (row) => row.rowType.startsWith("Value") && row.value !== null,
  );
  // Rows the Product key marks "Scored = No" (inferred or illustrative) are not measured.
  const valueRows = profile.skipUnscoredRows
    ? allValueRows.filter((row) => row.scored)
    : allValueRows;
  // A key with Value rows but none scored (for example Seattle) is scored on the total only.
  const totalOnly =
    !!file.nonGpc || (allValueRows.length > 0 && valueRows.length === 0);

  const valueStored = stored.filter(
    (item) =>
      !item.notation && (item.valueT !== 0 || !profile.zeroRowMatchesAbsent),
  );
  const groups = new Map<
    string,
    { gpc: string; scope: string; valueT: number; omit: boolean }
  >();
  for (const item of valueStored) {
    const key = `${item.gpc}|${normalizeScope(item.scope)}`;
    const entry = groups.get(key) ?? {
      gpc: item.gpc,
      scope: normalizeScope(item.scope),
      valueT: 0,
      omit: item.omit,
    };
    entry.valueT += item.valueT;
    groups.set(key, entry);
  }

  const explained = new Set<string>();
  let matchedRows = 0;
  let foundByRef = 0;
  let valueRight = 0;
  let classDen = 0;
  let classRight = 0;
  const missingRows: FileScore["missingRows"] = [];

  // Strict rows: one ref, no wildcard, with a scope. Grouped by ref and scope.
  const strict: [string, KeyRow[]][] = [];
  const strictIndex = new Map<string, KeyRow[]>();
  const addStrict = (key: string, row: KeyRow) => {
    const existing = strictIndex.get(key);
    if (existing && profile.sumSameRefScope) {
      existing.push(row);
      return;
    }
    const rows = [row];
    strictIndex.set(key, rows);
    strict.push([key, rows]);
  };
  const aggregate: KeyRow[] = [];
  for (const row of valueRows) {
    const parsed = parseRefs(row.gpc);
    const exactRef =
      parsed.refs.length === 1 &&
      !parsed.refs[0].includes(".x") &&
      !(profile.parentRefMatchesChildren && SUBSECTOR_REF.test(parsed.refs[0]));
    const single =
      exactRef && normalizeScope(row.scope) !== "" && !row.ambiguous;
    if (single) {
      const key = `${parsed.refs[0]}|${normalizeScope(row.scope)}`;
      addStrict(key, row);
    } else if (exactRef && normalizeScope(row.scope) !== "") {
      // Ambiguous flag on a single ref: still compared per ref and scope.
      const key = `${parsed.refs[0]}|${normalizeScope(row.scope)}`;
      addStrict(key, row);
    } else {
      aggregate.push(row);
    }
  }

  for (const [key, rows] of strict) {
    const expected = rows.reduce((sum, row) => sum + (row.value ?? 0), 0);
    const slack = rows.reduce((sum, row) => sum + tolOf(row.value), 0);
    const group = groups.get(key);
    // A key row of 0 matches a stored zero or no stored row (stored zeros are dropped above unless the profile needs them).
    const zeroMatch =
      profile.zeroRowMatchesAbsent && !group && Math.abs(expected) <= slack;
    if (group || zeroMatch) foundByRef += rows.length;
    const exact =
      zeroMatch || (!!group && Math.abs(group.valueT - expected) <= slack);
    if (exact) {
      matchedRows += rows.length;
      valueRight += rows.length;
      if (group) explained.add(key);
    } else {
      missingRows.push(
        ...rows.map((row) => ({
          description: row.description,
          gpc: row.gpc,
          value: row.value,
        })),
      );
    }
    // Classification: the value is somewhere in the stored groups; it is right
    // when its own reference and scope hold it. Checking its own group first
    // keeps a repeated value from depending on the order of the groups.
    const own = !!group && Math.abs(group.valueT - expected) <= slack;
    const elsewhere =
      own ||
      [...groups.values()].some((g) => Math.abs(g.valueT - expected) <= slack);
    if (elsewhere) {
      classDen += rows.length;
      if (own) classRight += rows.length;
    }
  }

  // Aggregate rows: the source does not split them, compare the sum under the refs.
  for (const row of aggregate) {
    const parsed = parseRefs(row.gpc);
    const patterns = [...parsed.refs, ...parsed.alternates];
    if (parsed.refs.length === 0) {
      // No ref known ("to confirm"): value-only match, no classification.
      const hit = [...groups.entries()].find(
        ([, g]) => Math.abs(g.valueT - (row.value ?? 0)) <= tolOf(row.value),
      );
      if (hit) {
        matchedRows += 1;
        explained.add(hit[0]);
      } else {
        missingRows.push({
          description: row.description,
          gpc: row.gpc,
          value: row.value,
        });
      }
      continue;
    }
    // A scope given in the key is kept; only a row without one sums across scopes.
    const rowScope = normalizeScope(row.scope);
    const under = [...groups.entries()].filter(
      ([, g]) =>
        patterns.some((pattern) => matchesRef(pattern, g.gpc)) &&
        (rowScope === "" || g.scope === rowScope),
    );
    const sum = under.reduce((acc, [, g]) => acc + g.valueT, 0);
    // Same zero-as-absent rule as the strict rows, for both value counters.
    const zeroMatch =
      profile.zeroRowMatchesAbsent &&
      under.length === 0 &&
      Math.abs(row.value ?? 0) <= tolOf(row.value);
    if (under.length > 0 || zeroMatch) foundByRef += 1;
    if (
      zeroMatch ||
      (under.length > 0 && Math.abs(sum - (row.value ?? 0)) <= tolOf(row.value))
    ) {
      matchedRows += 1;
      valueRight += 1;
      classDen += 1;
      classRight += 1;
      for (const [key] of under) explained.add(key);
    } else {
      missingRows.push({
        description: row.description,
        gpc: row.gpc,
        value: row.value,
      });
      const anywhere = [...groups.values()].find(
        (g) => Math.abs(g.valueT - (row.value ?? 0)) <= tolOf(row.value),
      );
      if (anywhere) classDen += 1;
    }
  }

  // Diagnostic view that ignores the scope split: sum per subsector (I.1, II.2, IV.1 ...).
  const subsector = (ref: string) => ref.split(".").slice(0, 2).join(".");
  const subsectorKeyRows = new Map<string, KeyRow[]>();
  for (const [, rows] of strict) {
    for (const row of rows) {
      const key = subsector(parseRefs(row.gpc).refs[0]);
      subsectorKeyRows.set(key, [...(subsectorKeyRows.get(key) ?? []), row]);
    }
  }
  let subsectorMatched = 0;
  let subsectorRows = 0;
  for (const [key, rows] of subsectorKeyRows) {
    subsectorRows += rows.length;
    const expected = rows.reduce((sum, row) => sum + (row.value ?? 0), 0);
    const actual = [...groups.values()]
      .filter((group) => subsector(group.gpc) === key)
      .reduce((sum, group) => sum + group.valueT, 0);
    const slack = rows.reduce((sum, row) => sum + tolOf(row.value), 0);
    if (Math.abs(actual - expected) <= slack) {
      subsectorMatched += rows.length;
    }
  }

  // GPC keeps these out of BASIC and BASIC+. The app only flags I.4.4 today (CC-1201 covers the rest).
  const storedTotal = valueStored
    .filter((item) => !item.omit && !isGpcExcluded(item.gpc))
    .reduce((sum, item) => sum + item.valueT, 0);
  const totalDiff =
    file.expectedTotal !== null ? storedTotal - file.expectedTotal : null;

  // Notation keys: scored keys only; the wildcard and multi-ref patterns apply.
  const notationRows = file.rows.filter(
    (row) =>
      row.rowType === "Notation key" &&
      (row.scored || !profile.skipUnscoredRows) &&
      row.notation,
  );
  let notationRecovered = 0;
  for (const row of notationRows) {
    const canonical = toCanonical(row.notation);
    const patterns = parseRefs(row.gpc);
    const all = [...patterns.refs, ...patterns.alternates];
    const hit = stored.some(
      (item) =>
        !!item.notation &&
        item.notation === canonical &&
        all.some((pattern) => matchesRef(pattern, item.gpc)),
    );
    if (hit) notationRecovered += 1;
  }

  const keyNumbers = new Set(allValueRows.map((row) => row.value));
  const distractorsStored: FileScore["distractorsStored"] = [];
  for (const distractor of file.distractors) {
    for (const number of distractor.numbers) {
      if (keyNumbers.has(number)) continue;
      for (const group of groups.values()) {
        if (Math.abs(group.valueT - number) <= tolOf(number)) {
          distractorsStored.push({
            valueT: group.valueT,
            gpc: group.gpc,
            what: distractor.what,
            failureMode: distractor.failureMode,
          });
        }
      }
    }
  }

  const unexpectedStored = [...groups.entries()]
    .filter(([key]) => !explained.has(key))
    .map(([, g]) => ({ gpc: g.gpc, scope: g.scope || null, valueT: g.valueT }));

  // Non-GPC documents and keys with no scored rows are scored on the total only.
  const rows = !totalOnly;
  const totalTol = totalTolerance(file);
  const totalTonnes =
    totalTol.source === "rule"
      ? totalTol.tonnes
      : Math.max(totalTol.tonnes, 0.5);
  return {
    keyValueRows: valueRows.length,
    storedGroups: groups.size,
    matchedRows: rows ? matchedRows : 0,
    rowRecall: rows ? ratio(matchedRows, valueRows.length) : null,
    rowPrecision: rows ? ratio(explained.size, groups.size) : null,
    subsectorRecall: rows ? ratio(subsectorMatched, subsectorRows) : null,
    valueAccuracy: rows ? ratio(valueRight, foundByRef) : null,
    classificationAccuracy: rows ? ratio(classRight, classDen) : null,
    expectedTotal: file.expectedTotal,
    storedTotal,
    totalDiffPct:
      totalDiff !== null && file.expectedTotal
        ? (totalDiff / Math.abs(file.expectedTotal)) * 100
        : null,
    totalWithinTolerance:
      totalDiff !== null ? Math.abs(totalDiff) <= totalTonnes : null,
    toleranceSource: rowTolerance(file).source,
    notationScored: notationRows.length,
    notationRecovered,
    distractorsStored,
    unexpectedStored: rows ? unexpectedStored : [],
    missingRows: rows ? missingRows : [],
  };
}
