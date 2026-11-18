/**
 * The "parent refs (Mirco)" score variant of a precomputed pipeline run
 * (CC-1295). The standard score stays the headline; the variant is shown
 * beside it, labelled.
 *
 * An external pipeline can report an unsplit subsector (I.3 with no scope)
 * where the key splits it into children. Approve drops such a row
 * (gpc-reference-unknown), so the standard score never sees it. The variant
 * adds those dropped rows back and writes every unsplit I/II/III subsector in
 * the scorer's `.x` wildcard form (Mirco's rule): `I.3.x` matches a key row
 * written as `I.3` or `I.3.x`, never an exact scoped child row such as I.3.1
 * scope 1, so no scope or child reference is invented.
 *
 * scoreFile and SCORER_VERSION are unchanged.
 */
import type { KeyFile } from "@/backend/ingestion-benchmark/answer-keys";
import {
  scoreFile,
  type FileScore,
  type StoredValue,
} from "@/backend/ingestion-benchmark/score";

const PARENT_REF = /^(?:I|II|III)\.\d+$/;

/** An unsplit I, II or III subsector reference such as "I.3". */
export const isParentReference = (ref: string): boolean => PARENT_REF.test(ref);

/**
 * Port of Mirco's `scoringReference` (pdf-extraction/benchmarks/
 * comparison-bridge.ts, branch mr/pdf-taxonomy-extraction): an unsplit
 * I/II/III subsector gets the scorer's `.x` wildcard; any other reference is
 * returned unchanged.
 */
export function scoringReference(ref: string): string {
  return isParentReference(ref) ? `${ref}.x` : ref;
}

/**
 * Parent-reference rows whose children approve stored too (a stored gpc
 * starting with `<ref>.`). The variant counts their amount twice: once in the
 * stored children, once as `<ref>.x`.
 */
export function parentRefOverlap(
  parentRefRows: StoredValue[],
  stored: StoredValue[],
): number {
  return parentRefRows.filter((row) =>
    stored.some((value) => value.gpc.startsWith(`${row.gpc}.`)),
  ).length;
}

export function scoreWithVariant(
  key: KeyFile,
  stored: StoredValue[],
  parentRefRows: StoredValue[] = [],
): { standard: FileScore; parentRefs: FileScore } {
  return {
    standard: scoreFile(key, stored),
    parentRefs: scoreFile(
      key,
      [...stored, ...parentRefRows].map((value) => ({
        ...value,
        gpc: scoringReference(value.gpc),
      })),
    ),
  };
}
