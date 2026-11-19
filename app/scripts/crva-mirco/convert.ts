/**
 * Converts a result of Mirco's pdf-extraction pipeline (JSON Schema mode) into a
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

/** One schema array item (`/<fieldId>/<index>`) with the evidence of all its leaves. */
export interface MircoItem {
  fieldId: string;
  index: number;
  value: unknown;
  evidence: { page: number; quote: string }[];
}

export interface MircoUsage {
  promptTokens: number;
  completionTokens: number;
  cachedInputTokens: number;
  reasoningTokens: number;
}

/** Only the parts of Mirco's result this converter reads; the rest passes through. */
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
 * Mirco's validator wants an outcome per data leaf (`/C1.1a/0/hazard`), while v0
 * has one value per item, so `found` leaves are grouped by item. Items whose
 * outcomes are all `ambiguous` are not v0 values; they are only counted.
 */
export function mircoItems(result: unknown): {
  items: MircoItem[];
  badPointers: number;
  ambiguousItems: number;
} {
  const parsed = ResultSchema.safeParse(result);
  if (!parsed.success) return { items: [], badPointers: 0, ambiguousItems: 0 };
  const { data } = parsed.data;
  const items = new Map<string, MircoItem>();
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
    // Mirco's validator counts an empty array as a leaf, so an empty field still
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
    const item: MircoItem = items.get(key) ?? {
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
export function assembleMircoBundle(input: {
  file: string;
  items: MircoItem[];
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
export function mircoUsage(usage: unknown): MircoUsage {
  const u = UsageSchema.catch(UsageSchema.parse({})).parse(usage);
  return {
    promptTokens: u.input_tokens,
    completionTokens: u.output_tokens,
    cachedInputTokens: u.input_tokens_details.cached_tokens,
    reasoningTokens: u.output_tokens_details.reasoning_tokens,
  };
}

export function mircoRunStats(input: {
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
      ? `Mirco result is null (execution_status: ${env.execution_status ?? "unknown"})`
      : undefined;
  const kept = error ? null : bundle;
  const turns = (env.repair?.repairs ?? 0) + 1;
  const usage = mircoUsage(env.usage);
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
