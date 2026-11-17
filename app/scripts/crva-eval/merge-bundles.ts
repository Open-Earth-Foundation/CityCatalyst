import {
  CRVA_FIELD_IDS,
  type CrvaDraftBundle,
} from "@/backend/ingest/plugins/ccra/draft-schema";
import { dedupeValues } from "@/backend/ingest/plugins/ccra/extract-crva-fields";

/**
 * Rebuilds one bundle from per-part bundles. Part pages are relative to the
 * part, so they are shifted by `startPage - 1` back to original pages.
 */
export function mergePartBundles(
  parts: { startPage: number; bundle: CrvaDraftBundle }[],
  original: { file: string; pageCount: number },
): CrvaDraftBundle {
  const values = parts.flatMap(({ startPage, bundle }) =>
    bundle.values.map((v) => ({
      ...v,
      source: {
        ...v.source,
        file: original.file,
        page: v.source.page + startPage - 1,
      },
    })),
  );
  // Stable sort so the earliest page wins when the same value repeats.
  values.sort((a, b) => a.source.page - b.source.page);
  const deduped = dedupeValues(values);

  const covered = new Set(deduped.map((v) => v.fieldId));
  return {
    file: original.file,
    pageCount: original.pageCount,
    ocrModel: parts[0].bundle.ocrModel,
    extractionModel: parts[0].bundle.extractionModel,
    values: deduped,
    uncoveredFields: CRVA_FIELD_IDS.filter((id) => !covered.has(id)),
    figures: parts.flatMap(({ startPage, bundle }) =>
      bundle.figures.map((f) => ({ ...f, page: f.page + startPage - 1 })),
    ),
    dropped: parts.flatMap(({ startPage, bundle }) =>
      bundle.dropped.map((d) => ({
        ...d,
        page: d.page === null ? null : d.page + startPage - 1,
      })),
    ),
  };
}
