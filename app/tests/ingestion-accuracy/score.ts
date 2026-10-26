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
import { toCanonical } from "@/util/notation-keys";

export type KeyRow = {
  row: number | null;
  description: string;
  year: number | null;
  value: number | null;
  gpc: string;
  scope: string;
  ambiguous: boolean;
  rowType: string;
  notation: string;
  scored: boolean;
  note: string;
};

export type KeyDistractor = {
  where: string;
  what: string;
  examples: string;
  numbers: number[];
  failureMode: string;
};

export type KeyFile = {
  id: string;
  city: string;
  country: string;
  year: number;
  fileName: string;
  expectedTotal: number | null;
  toleranceText: string;
  tolerance: number;
  totalTolerance: number;
  keyValueRows: number | null;
  rows: KeyRow[];
  distractors: KeyDistractor[];
};

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

function refMatches(pattern: string, ref: string): boolean {
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

const ratio = (num: number, den: number): number | null =>
  den > 0 ? num / den : null;

export function scoreFile(file: KeyFile, stored: StoredValue[]): FileScore {
  // The sources print whole tonnes; keep half a tonne of slack for the kg to t conversion.
  const tol = Math.max(file.tolerance, 0.5);
  const valueRows = file.rows.filter(
    (row) => row.rowType.startsWith("Value") && row.value !== null,
  );

  const valueStored = stored.filter(
    (item) => !item.notation && item.valueT !== 0,
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
  const strict = new Map<string, KeyRow[]>();
  const aggregate: KeyRow[] = [];
  for (const row of valueRows) {
    const parsed = parseRefs(row.gpc);
    const single =
      parsed.refs.length === 1 &&
      !parsed.refs[0].includes(".x") &&
      normalizeScope(row.scope) !== "" &&
      !row.ambiguous;
    if (single) {
      const key = `${parsed.refs[0]}|${normalizeScope(row.scope)}`;
      strict.set(key, [...(strict.get(key) ?? []), row]);
    } else if (
      parsed.refs.length === 1 &&
      !parsed.refs[0].includes(".x") &&
      normalizeScope(row.scope) !== ""
    ) {
      // Ambiguous flag on a single ref: still compared per ref and scope.
      const key = `${parsed.refs[0]}|${normalizeScope(row.scope)}`;
      strict.set(key, [...(strict.get(key) ?? []), row]);
    } else {
      aggregate.push(row);
    }
  }

  for (const [key, rows] of strict) {
    const expected = rows.reduce((sum, row) => sum + (row.value ?? 0), 0);
    const slack = tol * rows.length;
    const group = groups.get(key);
    if (group) foundByRef += rows.length;
    const exact = !!group && Math.abs(group.valueT - expected) <= slack;
    if (exact) {
      matchedRows += rows.length;
      valueRight += rows.length;
      explained.add(key);
    } else {
      missingRows.push(
        ...rows.map((row) => ({
          description: row.description,
          gpc: row.gpc,
          value: row.value,
        })),
      );
    }
    const anywhere = [...groups.entries()].find(
      ([, g]) => Math.abs(g.valueT - expected) <= slack,
    );
    if (anywhere) {
      classDen += rows.length;
      if (anywhere[0] === key) classRight += rows.length;
    }
  }

  // Aggregate rows: the source does not split them, compare the sum under the refs.
  for (const row of aggregate) {
    const parsed = parseRefs(row.gpc);
    const patterns = [...parsed.refs, ...parsed.alternates];
    if (parsed.refs.length === 0) {
      // No ref known ("to confirm"): value-only match, no classification.
      const hit = [...groups.entries()].find(
        ([, g]) => Math.abs(g.valueT - (row.value ?? 0)) <= tol,
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
    const under = [...groups.entries()].filter(([, g]) =>
      patterns.some((pattern) => refMatches(pattern, g.gpc)),
    );
    const sum = under.reduce((acc, [, g]) => acc + g.valueT, 0);
    if (under.length > 0) foundByRef += 1;
    if (Math.abs(sum - (row.value ?? 0)) <= tol) {
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
        (g) => Math.abs(g.valueT - (row.value ?? 0)) <= tol,
      );
      if (anywhere) classDen += 1;
    }
  }

  // Diagnostic view that ignores the scope split: sum per subsector (I.1, II.2, IV.1 ...).
  const subsector = (ref: string) => ref.split(".").slice(0, 2).join(".");
  const subsectorKeyRows = new Map<string, KeyRow[]>();
  for (const rows of strict.values()) {
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
    if (Math.abs(actual - expected) <= tol * rows.length) {
      subsectorMatched += rows.length;
    }
  }

  const storedTotal = valueStored
    .filter((item) => !item.omit)
    .reduce((sum, item) => sum + item.valueT, 0);
  const totalDiff =
    file.expectedTotal !== null ? storedTotal - file.expectedTotal : null;

  // Notation keys: scored keys only; the wildcard and multi-ref patterns apply.
  const notationRows = file.rows.filter(
    (row) => row.rowType === "Notation key" && row.scored && row.notation,
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
        all.some((pattern) => refMatches(pattern, item.gpc)),
    );
    if (hit) notationRecovered += 1;
  }

  const keyNumbers = new Set(valueRows.map((row) => row.value));
  const distractorsStored: FileScore["distractorsStored"] = [];
  for (const distractor of file.distractors) {
    for (const number of distractor.numbers) {
      if (keyNumbers.has(number)) continue;
      for (const group of groups.values()) {
        if (Math.abs(group.valueT - number) <= tol) {
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

  return {
    keyValueRows: valueRows.length,
    storedGroups: groups.size,
    matchedRows,
    rowRecall: ratio(matchedRows, valueRows.length),
    rowPrecision: ratio(explained.size, groups.size),
    subsectorRecall: ratio(subsectorMatched, subsectorRows),
    valueAccuracy: ratio(valueRight, foundByRef),
    classificationAccuracy: ratio(classRight, classDen),
    expectedTotal: file.expectedTotal,
    storedTotal,
    totalDiffPct:
      totalDiff !== null && file.expectedTotal
        ? (totalDiff / Math.abs(file.expectedTotal)) * 100
        : null,
    totalWithinTolerance:
      totalDiff !== null
        ? Math.abs(totalDiff) <= Math.max(file.totalTolerance, 0.5)
        : null,
    notationScored: notationRows.length,
    notationRecovered,
    distractorsStored,
    unexpectedStored,
    missingRows,
  };
}
