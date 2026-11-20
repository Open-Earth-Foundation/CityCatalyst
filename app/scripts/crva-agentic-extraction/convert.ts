/**
 * Converts a result of the pdf-extraction pipeline (JSON Schema mode) into a
 * CRVA draft bundle and run stats, with the v0 validation, quote check and dedupe,
 * so scripts/crva-eval/score-run.ts scores it unchanged.
 */
import {
  CRVA_FIELD_IDS,
  type CrvaDraftBundle,
  type CrvaDraftValue,
  type CrvaDroppedValue,
} from "@/backend/ingest/plugins/ccra/draft-schema";
import {
  candidatesToDraftValues,
  dedupeValues,
} from "@/backend/ingest/plugins/ccra/extract-crva-fields";
import { verifyQuotes } from "@/backend/ingest/plugins/ccra/verify-quotes";
import { z } from "zod";
import type { OcrCache } from "../crva-eval/ocr-cache";
import type { RunStats } from "../crva-eval/run-adapter";
import { RISK_ROWS_KEY } from "./groups";

/** One schema array item (`/<fieldId>/<index>`) with the evidence of all its leaves. */
export interface AgenticItem {
  fieldId: string;
  index: number;
  value: unknown;
  evidence: { page: number; quote: string }[];
}

export interface AgenticUsage {
  promptTokens: number;
  completionTokens: number;
  cachedInputTokens: number;
  reasoningTokens: number;
}

/** Only the parts of the pipeline's result this converter reads; the rest passes through. */
const EvidenceSchema = z.object({ pdf_page: z.number(), quote: z.string() });
const OutcomeSchema = z.object({
  field_id: z.string(),
  status: z.string(),
  observations: z.array(z.object({ evidence: z.array(z.unknown()) })),
});
const ResultSchema = z.object({
  data: z.record(z.string(), z.unknown()).catch({}),
  fields: z.array(z.unknown()),
});
const EnvelopeSchema = z.object({
  result: z.unknown(),
  execution_status: z.string().optional().catch(undefined),
  repair: z
    .object({ repairs: z.number().catch(0) })
    .optional()
    .catch(undefined),
  usage: z.unknown(),
});
const UsageSchema = z.object({
  input_tokens: z.number().catch(0),
  output_tokens: z.number().catch(0),
  input_tokens_details: z
    .object({ cached_tokens: z.number().catch(0) })
    .catch({ cached_tokens: 0 }),
  output_tokens_details: z
    .object({ reasoning_tokens: z.number().catch(0) })
    .catch({ reasoning_tokens: 0 }),
});

/** RFC 6901 pointer segments. */
function pointerSegments(pointer: string): string[] {
  return pointer
    .split("/")
    .slice(1)
    .map((s) => s.replace(/~1/g, "/").replace(/~0/g, "~"));
}

/**
 * The pipeline's validator wants an outcome per data leaf (`/C1.1a/0/hazard`), while v0
 * has one value per item, so `found` leaves are grouped by item. Items whose
 * outcomes are all `ambiguous` are not v0 values; they are only counted.
 */
export function agenticItems(result: unknown): {
  items: AgenticItem[];
  badPointers: number;
  ambiguousItems: number;
} {
  const parsed = ResultSchema.safeParse(result);
  if (!parsed.success) return { items: [], badPointers: 0, ambiguousItems: 0 };
  const { data } = parsed.data;
  const items = new Map<string, AgenticItem>();
  const ambiguous = new Set<string>();
  let badPointers = 0;
  for (const raw of parsed.data.fields) {
    const outcome = OutcomeSchema.safeParse(raw);
    if (!outcome.success) continue;
    const { status } = outcome.data;
    if (status !== "found" && status !== "ambiguous") continue;
    const segments = pointerSegments(outcome.data.field_id);
    const [fieldId, indexText] = segments;
    const index = Number(indexText);
    const list = data[fieldId];
    // The pipeline's validator counts an empty array as a leaf, so an empty field still
    // gets an outcome; it holds no value and is not a v0 drop.
    if (segments.length === 1 && Array.isArray(list) && list.length === 0) {
      continue;
    }
    const valid =
      CRVA_FIELD_IDS.includes(fieldId) &&
      /^\d+$/.test(indexText ?? "") &&
      Array.isArray(list) &&
      list[index] !== undefined;
    if (status === "ambiguous") {
      if (valid) ambiguous.add(`${fieldId}/${index}`);
      continue;
    }
    if (!valid) {
      badPointers += 1;
      continue;
    }
    const key = `${fieldId}/${index}`;
    const item: AgenticItem = items.get(key) ?? {
      fieldId,
      index,
      value: list[index],
      evidence: [],
    };
    items.set(key, item);
    for (const observation of outcome.data.observations) {
      for (const rawEvidence of observation.evidence) {
        const evidence = EvidenceSchema.safeParse(rawEvidence);
        if (!evidence.success) continue;
        const { pdf_page: page, quote } = evidence.data;
        if (!item.evidence.some((x) => x.page === page && x.quote === quote)) {
          item.evidence.push({ page, quote });
        }
      }
    }
  }
  const ambiguousItems = [...ambiguous].filter((key) => !items.has(key)).length;
  return { items: [...items.values()], badPointers, ambiguousItems };
}

const A12aSchema = z.object({
  author: z.string(),
  title: z.string(),
  year: z.number().nullable(),
});

/**
 * The pipeline's A1.2a item is `{author, title, year, used_for}`; v0 holds
 * `{name, year}`, so author and title go into `name` for the judge. Any other
 * value, and the old `{name, year}` shape, passes through.
 */
export function toV0Value(fieldId: string, value: unknown): unknown {
  if (fieldId !== "A1.2a") return value;
  const parsed = A12aSchema.safeParse(value);
  if (!parsed.success) return value;
  const { author, title, year } = parsed.data;
  const name = [author, title]
    .map((part) => part.trim())
    .filter(Boolean)
    .join(" — ");
  return { name, year };
}

const INVALID: CrvaDroppedValue = {
  fieldId: "unknown",
  page: null,
  quote: null,
  reason: "invalid_value",
};

/**
 * Like assembleBundle, but an item tries each of its quotes and keeps the longest
 * that passes (a short leaf quote, like a hazard name, supports less of the value
 * the judge reads); one drop per failed item.
 */
export function assembleAgenticBundle(input: {
  file: string;
  items: AgenticItem[];
  badPointers: number;
  ocr: OcrCache;
  extractionModel: string;
}): CrvaDraftBundle {
  const { file, items, badPointers, ocr, extractionModel } = input;
  const kept: CrvaDraftValue[] = [];
  const dropped: CrvaDroppedValue[] = Array.from(
    { length: badPointers },
    () => ({ ...INVALID }),
  );
  for (const item of items) {
    let firstDrop: CrvaDroppedValue | null = null;
    let found: CrvaDraftValue | null = null;
    for (const e of item.evidence) {
      const candidate = {
        fieldId: item.fieldId,
        value: toV0Value(item.fieldId, item.value),
        page: e.page,
        quote: e.quote,
      };
      const extracted = candidatesToDraftValues(
        [candidate],
        file,
        CRVA_FIELD_IDS,
      );
      const checked = verifyQuotes(extracted.values, ocr.pages);
      const passed = checked.verified[0];
      if (
        passed &&
        (!found || passed.source.quote.length > found.source.quote.length)
      ) {
        found = passed;
      }
      if (!passed) {
        firstDrop ??= [...extracted.dropped, ...checked.dropped][0] ?? null;
      }
    }
    if (found) kept.push(found);
    else dropped.push(firstDrop ?? { ...INVALID, fieldId: item.fieldId });
  }
  const values = dedupeValues(kept);
  const covered = new Set(values.map((value) => value.fieldId as string));
  return {
    file,
    pageCount: ocr.pageCount,
    ocrModel: ocr.ocrModel,
    extractionModel,
    values,
    uncoveredFields: CRVA_FIELD_IDS.filter((id) => !covered.has(id)),
    figures: ocr.figures,
    dropped,
  };
}

/** Agents API session usage; unknown or missing keys count as 0. */
export function agenticUsage(usage: unknown): AgenticUsage {
  const u = UsageSchema.catch(UsageSchema.parse({})).parse(usage);
  return {
    promptTokens: u.input_tokens,
    completionTokens: u.output_tokens,
    cachedInputTokens: u.input_tokens_details.cached_tokens,
    reasoningTokens: u.output_tokens_details.reasoning_tokens,
  };
}

export function agenticRunStats(input: {
  run: number;
  envelope: unknown;
  bundle: CrvaDraftBundle | null;
  minutes: number;
  ocr: OcrCache;
  ocrOn: boolean;
}): RunStats {
  const { run, envelope, bundle, minutes, ocr, ocrOn } = input;
  const env = EnvelopeSchema.catch({
    result: null,
    execution_status: undefined,
    repair: undefined,
    usage: undefined,
  }).parse(envelope);
  const error =
    env.result == null || bundle === null
      ? `Pipeline result is null (execution_status: ${env.execution_status ?? "unknown"})`
      : undefined;
  const kept = error ? null : bundle;
  const turns = (env.repair?.repairs ?? 0) + 1;
  const usage = agenticUsage(env.usage);
  const droppedByReason: Record<string, number> = {};
  for (const d of kept?.dropped ?? []) {
    droppedByReason[d.reason] = (droppedByReason[d.reason] ?? 0) + 1;
  }
  return {
    run,
    status: error ? "failed" : "ok",
    minutes,
    parts: 1,
    retries: 0,
    ocrPages: ocrOn ? ocr.pageCount : 0,
    promptTokens: usage.promptTokens,
    completionTokens: usage.completionTokens,
    cachedInputTokens: usage.cachedInputTokens,
    llmCalls: turns,
    nonStopFinishes: 0,
    modelTurns: turns,
    valuesKept: kept?.values.length ?? 0,
    valuesDropped: kept?.dropped.length ?? 0,
    droppedByReason,
    fieldsWithValue: kept
      ? CRVA_FIELD_IDS.length - kept.uncoveredFields.length
      : 0,
    figures: kept?.figures.length ?? 0,
    warnings: 0,
    ...(error ? { error } : {}),
  };
}

const filled = z.string().trim().min(1);
const RiskRowSchema = z.object({
  hazard: filled,
  receptor: filled,
  level: filled,
  scenario: z.string(),
  horizon: z.string(),
  table: z.string(),
});

const fold = (s: string) =>
  s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

/** Evidence of the `found` outcomes under `/<key>/<index>`, by index. */
function evidenceByIndex(
  fields: unknown[],
  key: string,
): Map<number, { page: number; quote: string }[]> {
  const out = new Map<number, { page: number; quote: string }[]>();
  for (const raw of fields) {
    const outcome = OutcomeSchema.safeParse(raw);
    if (!outcome.success || outcome.data.status !== "found") continue;
    const [first, indexText] = pointerSegments(outcome.data.field_id);
    if (first !== key || !/^\d+$/.test(indexText ?? "")) continue;
    const list = out.get(Number(indexText)) ?? [];
    for (const observation of outcome.data.observations) {
      for (const rawEvidence of observation.evidence) {
        const e = EvidenceSchema.safeParse(rawEvidence);
        if (!e.success) continue;
        const { pdf_page: page, quote } = e.data;
        if (!list.some((x) => x.page === page && x.quote === quote))
          list.push({ page, quote });
      }
    }
    out.set(Number(indexText), list);
  }
  return out;
}

type E1Value = {
  title: string;
  description: string;
  hazards: string[];
  affected: string[];
};

/**
 * Wave 2 risk table rows: one row per cell, grouped into one E1.1a item per
 * hazard × receptor with the levels per scenario and horizon. A group whose
 * hazard × receptor matches a text item is appended to that item instead
 * (textItems are changed in place); the rest are returned as new items.
 */
export function riskRowItems(input: {
  rows: unknown[];
  fields: unknown[];
  textItems: AgenticItem[];
}): AgenticItem[] {
  return riskRows(input).items;
}

/**
 * riskRowItems plus a count of what it could not use (a row that fails the schema
 * or has no evidence, an outcome for a row index that does not exist), counted
 * like bad pointers on the other fields.
 */
function riskRows(input: {
  rows: unknown[];
  fields: unknown[];
  textItems: AgenticItem[];
}): { items: AgenticItem[]; bad: number } {
  const evidence = evidenceByIndex(input.fields, RISK_ROWS_KEY);
  let bad = [...evidence.keys()].filter((i) => i >= input.rows.length).length;
  const groups = new Map<
    string,
    {
      hazard: string;
      receptor: string;
      cells: string[];
      tables: string[];
      evidence: { page: number; quote: string }[];
    }
  >();
  input.rows.forEach((raw, index) => {
    const row = RiskRowSchema.safeParse(raw);
    const rowEvidence = evidence.get(index) ?? [];
    if (!row.success || rowEvidence.length === 0) {
      bad += 1;
      return;
    }
    const { hazard, receptor, level, scenario, horizon, table } = row.data;
    const key = `${fold(hazard)}×${fold(receptor)}`;
    const group = groups.get(key) ?? {
      hazard,
      receptor,
      cells: [],
      tables: [],
      evidence: [],
    };
    const when = [scenario, horizon].map((s) => s.trim()).filter(Boolean);
    group.cells.push(when.length ? `${when.join(" ")}: ${level}` : level);
    if (table && !group.tables.includes(table)) group.tables.push(table);
    for (const e of rowEvidence) {
      if (!group.evidence.some((x) => x.page === e.page && x.quote === e.quote))
        group.evidence.push(e);
    }
    groups.set(key, group);
  });

  const titleKey = (v: Partial<E1Value> | null) => {
    const [hazard, receptor] = (v?.title ?? "").split("×");
    return `${fold(v?.hazards?.[0] ?? hazard ?? "")}×${fold(v?.affected?.[0] ?? receptor ?? "")}`;
  };
  const added: AgenticItem[] = [];
  for (const [key, g] of groups) {
    const levels = `${g.cells.join("; ")}${g.tables.length ? ` (${g.tables.join(", ")})` : ""}`;
    const match = input.textItems.find(
      (item) =>
        item.fieldId === "E1.1a" &&
        titleKey(item.value as Partial<E1Value> | null) === key,
    );
    if (match) {
      const value = match.value as E1Value;
      value.description = `${value.description}; ${levels}`;
      for (const e of g.evidence) {
        if (
          !match.evidence.some((x) => x.page === e.page && x.quote === e.quote)
        )
          match.evidence.push(e);
      }
      continue;
    }
    added.push({
      fieldId: "E1.1a",
      index: input.textItems.length + added.length,
      value: {
        title: `${g.hazard} × ${g.receptor}`,
        description: levels,
        hazards: [g.hazard],
        affected: [g.receptor],
      },
      evidence: g.evidence,
    });
  }
  return { items: added, bad };
}

/** Joins the group jobs' results; a failed group (null result) adds nothing. */
export function mergeGroupResults(
  results: { groupId: string; result: unknown }[],
): { items: AgenticItem[]; badPointers: number; ambiguousItems: number } {
  const items: AgenticItem[] = [];
  let badPointers = 0;
  let ambiguousItems = 0;
  for (const { result } of results) {
    const parsed = ResultSchema.safeParse(result);
    if (!parsed.success) continue;
    const { [RISK_ROWS_KEY]: rows, ...data } = parsed.data.data;
    const isRow = (raw: unknown) =>
      OutcomeSchema.safeParse(raw).data?.field_id.startsWith(
        `/${RISK_ROWS_KEY}`,
      ) ?? false;
    const own = agenticItems({
      data,
      fields: parsed.data.fields.filter((f) => !isRow(f)),
    });
    badPointers += own.badPointers;
    ambiguousItems += own.ambiguousItems;
    items.push(...own.items);
    const rowFields = parsed.data.fields.filter(isRow);
    if (Array.isArray(rows)) {
      const risk = riskRows({ rows, fields: rowFields, textItems: own.items });
      items.push(...risk.items);
      badPointers += risk.bad;
    } else {
      badPointers += evidenceByIndex(rowFields, RISK_ROWS_KEY).size;
    }
  }
  return { items, badPointers, ambiguousItems };
}

/**
 * One envelope for run stats from the group jobs' envelopes: usage summed,
 * repairs summed plus one per extra job (agenticRunStats counts repairs + 1 turns).
 */
export function mergeEnvelopes(envelopes: unknown[]): {
  result: { data: Record<string, unknown>; fields: unknown[] } | null;
  execution_status: string;
  repair: { repairs: number };
  usage: {
    input_tokens: number;
    output_tokens: number;
    input_tokens_details: { cached_tokens: number };
    output_tokens_details: { reasoning_tokens: number };
  };
} {
  const parsed = envelopes.map((e) =>
    EnvelopeSchema.catch({
      result: null,
      execution_status: undefined,
      repair: undefined,
      usage: undefined,
    }).parse(e),
  );
  const usage = parsed.map((e) => agenticUsage(e.usage));
  const failed = parsed
    .map((e) => e.execution_status ?? "unknown")
    .filter((s) => s !== "completed");
  const sum = (pick: (u: AgenticUsage) => number) =>
    usage.reduce((total, u) => total + pick(u), 0);
  return {
    // A run missing a field group is not complete: agenticRunStats marks it failed.
    result:
      failed.length === 0 && parsed.every((e) => e.result != null)
        ? { data: {}, fields: [] }
        : null,
    execution_status: failed.length
      ? `partial: ${failed.join(", ")}`
      : "completed",
    repair: {
      repairs:
        parsed.reduce((total, e) => total + (e.repair?.repairs ?? 0), 0) +
        Math.max(0, parsed.length - 1),
    },
    usage: {
      input_tokens: sum((u) => u.promptTokens),
      output_tokens: sum((u) => u.completionTokens),
      input_tokens_details: { cached_tokens: sum((u) => u.cachedInputTokens) },
      output_tokens_details: {
        reasoning_tokens: sum((u) => u.reasoningTokens),
      },
    },
  };
}

/**
 * Wave 2.5: A1.2a comes from the reference pass only. The job's own A1.2a items
 * are dropped (in wave 2 they added climate models and other non-sources); with
 * no reference list found (null), the job's items stay.
 */
export function withReferenceItems(
  jobItems: AgenticItem[],
  referenceItems: AgenticItem[] | null,
): AgenticItem[] {
  if (!referenceItems) return jobItems;
  return [
    ...jobItems.filter((item) => item.fieldId !== "A1.2a"),
    ...referenceItems,
  ];
}

const A12aParts = z.object({
  author: z.string().catch(""),
  title: z.string().catch(""),
  year: z.number().nullable().catch(null),
});
const compact = (s: string) => fold(s).replace(/[^\p{L}\p{N}]/gu, "");
const overlaps = (a: string, b: string) =>
  a.length > 0 && b.length > 0 && (a.includes(b) || b.includes(a));

/** Same source: same year, and matching titles, or matching authors when a title is empty. */
function sameSource(a: unknown, b: unknown): boolean {
  const x = A12aParts.parse(a ?? {});
  const y = A12aParts.parse(b ?? {});
  if (x.year !== y.year) return false;
  const [tx, ty] = [compact(x.title), compact(y.title)];
  if (tx && ty) return tx.length >= 8 && ty.length >= 8 && overlaps(tx, ty);
  return overlaps(compact(x.author), compact(y.author));
}

/**
 * Wave 2.6: A1.2a = every reference-pass item plus the job's own A1.2a items
 * that no reference item covers. A report can cite sources outside its
 * reference list (text, tables, figures), which the job finds and the
 * reference pass does not. With no reference list found (null), the job's
 * items stay.
 */
export function unionReferenceItems(
  jobItems: AgenticItem[],
  referenceItems: AgenticItem[] | null,
): AgenticItem[] {
  if (!referenceItems) return jobItems;
  const extra = jobItems.filter(
    (item) =>
      item.fieldId === "A1.2a" &&
      !referenceItems.some((ref) => sameSource(item.value, ref.value)),
  );
  return [
    ...jobItems.filter((item) => item.fieldId !== "A1.2a"),
    ...extra,
    ...referenceItems,
  ];
}
