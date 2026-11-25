import {
  CRVA_FIELD_IDS,
  type CrvaDraftBundle,
} from "@/backend/ingest/plugins/ccra/draft-schema";
import {
  candidatesToDraftValues,
  dedupeValues,
} from "@/backend/ingest/plugins/ccra/extract-crva-fields";
import { verifyQuotes } from "@/backend/ingest/plugins/ccra/verify-quotes";
import type { OcrCache } from "../crva-eval/ocr-cache";

/** One JSON object per line; blank lines are skipped, unparsable ones counted. */
export function parseValuesJsonl(text: string): {
  candidates: unknown[];
  badLines: number;
} {
  const candidates: unknown[] = [];
  let badLines = 0;
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      candidates.push(JSON.parse(line));
    } catch {
      badLines += 1;
    }
  }
  return { candidates, badLines };
}

/** Applies v0's validation and quote check to the agent's output. */
export function assembleBundle(input: {
  file: string;
  candidates: unknown[];
  badLines: number;
  ocr: OcrCache;
  extractionModel: string;
}): CrvaDraftBundle {
  const { file, candidates, badLines, ocr, extractionModel } = input;
  const extracted = candidatesToDraftValues(candidates, file, CRVA_FIELD_IDS);
  const { verified, dropped } = verifyQuotes(extracted.values, ocr.pages);
  const values = dedupeValues(verified);
  const covered = new Set(values.map((value) => value.fieldId as string));
  const badLineDrops = Array.from({ length: badLines }, () => ({
    fieldId: "unknown",
    page: null,
    quote: null,
    reason: "invalid_value" as const,
  }));
  return {
    file,
    pageCount: ocr.pageCount,
    ocrModel: ocr.ocrModel,
    extractionModel,
    values,
    uncoveredFields: CRVA_FIELD_IDS.filter((id) => !covered.has(id)),
    figures: ocr.figures,
    dropped: [...badLineDrops, ...extracted.dropped, ...dropped],
  };
}
