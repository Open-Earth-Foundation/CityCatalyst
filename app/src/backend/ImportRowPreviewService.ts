import {
  GRID_GENERATION_GPC_REF,
  isImportedWasteRef,
  isOmittedGPCReference,
} from "@/util/GHGI/reported-totals";
import { hasLossOrConsumptionLabel } from "@/util/GHGI/activity-class-rules";
import type { ECRFImportResult } from "@/backend/ECRFImportService";
import {
  importRowSkipReason,
  resolveImportedTotalCO2e,
} from "@/backend/InventoryImportService";
import InventoryProgressService from "@/backend/InventoryProgressService";
import type { InventoryTypeEnum } from "@/util/enums";
import {
  scopeFromLabel,
  siblingReferences,
  taxonomyScope,
} from "@/util/GHGI/gpc-ref-resolver";
import type {
  ImportRowIssue,
  ImportRowOutcome,
  ImportRowPreview,
  ImportRowReview,
} from "@/util/types";
import { excelRowNumber } from "@/util/excel-row-number";

type ImportRow = ECRFImportResult["rows"][number];

/** Taxonomy scope, when the row states a different one. */
function conflictingScope(row: ImportRow): number | null {
  const stated = scopeFromLabel(row.review?.scope);
  const expected =
    row.review?.catalogueScope !== undefined
      ? row.review.catalogueScope
      : taxonomyScope(row.gpcRefNo);
  return expected != null && stated != null && stated !== expected
    ? expected
    : null;
}

/**
 * Why a row needs a user decision, or null. Rows reviewed so far include those
 * already decided, so the list stays on screen and a decision can be changed.
 * Nothing here looks at the wording of a quote: a found quote proves the text
 * exists, so it never clears a row. Only a recorded decision does.
 */
/**
 * True when the reference the row will be saved under and the scope it will
 * be saved with disagree in the database catalogue. This looks only at the
 * final values, so a per-row override that swaps the reference cannot hide a
 * conflict. A missing or invalid scope, or a reference with no catalogue
 * scope, is never a conflict.
 */
function finalPairConflict(row: ImportRow): boolean {
  const finalScope = scopeFromLabel(row.review?.finalScope);
  const finalCatalogue = row.review?.finalCatalogueScope;
  return (
    finalCatalogue != null &&
    finalScope != null &&
    finalScope !== finalCatalogue
  );
}

/**
 * A valued row the model placed on I.4.4 (left out of the total), without the
 * document naming that reference. Genuine grid supply may stay there; anything
 * else, or a label about losses or consumption, needs a decision. Other
 * omitted references (III.x.3, VI.1) keep their own handling. Rows without an
 * activity class are legacy and are not held.
 */
function isExcludedReferenceUnconfirmed(row: ImportRow): boolean {
  const review = row.review;
  const ref = review?.suggestedRefNo ?? row.gpcRefNo;
  if (!review || ref !== GRID_GENERATION_GPC_REF) return false;
  // A gas-only row (no totalCO2e) still carries a value.
  if (resolveImportedTotalCO2e(row) == null || review.refSource === "document")
    return false;
  if (!("activityClass" in review)) return false;
  return (
    review.activityClass !== "grid_supply" ||
    hasLossOrConsumptionLabel(review.category, review.subsector)
  );
}

export function reviewIssue(row: ImportRow): ImportRowIssue | null {
  const ref = row.review?.suggestedRefNo ?? row.gpcRefNo;
  if (conflictingScope({ ...row, gpcRefNo: ref }) != null)
    return "reference-conflict";
  if (finalPairConflict(row)) return "reference-conflict";
  if (row.review?.refSource === "document") return null;
  if (isExcludedReferenceUnconfirmed(row))
    return "excluded-reference-unconfirmed";
  return isImportedWasteRef(ref) ? "direction-unconfirmed" : null;
}

function toReview(row: ImportRow, issue: ImportRowIssue): ImportRowReview {
  const review = row.review!;
  const suggestedRefNo = review.suggestedRefNo ?? row.gpcRefNo;
  const expectedScope =
    conflictingScope({ ...row, gpcRefNo: suggestedRefNo }) ??
    (finalPairConflict(row) ? (review.finalCatalogueScope ?? null) : null);
  return {
    rowIndex: row.rowIndex,
    issue,
    value: row.totalCO2e ?? null,
    notationKey: row.notationKey ?? null,
    suggestedRefNo,
    chosenRefNo: row.gpcRefNo,
    sector: review.sector,
    subsector: review.subsector,
    category: review.category,
    scope: review.scope,
    finalScope: review.finalScope ?? review.scope,
    decisionToken: review.decisionToken,
    finalCatalogueScope: review.finalCatalogueScope,
    expectedScope,
    quote: review.directionEvidence,
    quoteFound: review.directionEvidenceFound,
    page: review.page,
    source: review.source,
    decision: review.decision,
    referenceOptions: Array.from(
      new Set([
        ...siblingReferences(suggestedRefNo),
        ...(issue === "excluded-reference-unconfirmed"
          ? ["I.6.2", "I.6.3"]
          : []),
      ]),
    ),
  };
}

/**
 * Rows held for a user decision, undecided or not. The review and the approve
 * route both use this, so they cannot disagree.
 */
export function findReviewRows(
  importResult: ECRFImportResult,
): ImportRowReview[] {
  if (!importResult.requiresReferenceReview) return [];
  return importResult.rows.flatMap((row) => {
    if (!row.review || !row.gpcRefNo) return [];
    if (row.errors?.length && row.issue !== "skipped-in-review") return [];
    const issue = reviewIssue(row);
    return issue ? [toReview(row, issue)] : [];
  });
}

/** Rows that still block approval. */
export function findPendingRows(
  importResult: ECRFImportResult,
): ImportRowReview[] {
  return findReviewRows(importResult).filter((row) => {
    if (!row.decision) return true;
    if (row.decision === "skip") return false;
    const finalScope = scopeFromLabel(row.finalScope);
    const expected =
      row.finalCatalogueScope !== undefined
        ? row.finalCatalogueScope
        : taxonomyScope(row.chosenRefNo);
    return row.issue === "reference-conflict"
      ? finalScope == null || expected == null || finalScope !== expected
      : finalScope != null && expected != null && finalScope !== expected;
  });
}

/**
 * Predicts, per uploaded row, whether approval will import it, skip it, or
 * import it without counting toward completion (outside the inventory type).
 * Uses the same rules as InventoryImportService.importECRFData.
 */
export async function previewImportRows(
  importResult: ECRFImportResult,
  inventoryType: InventoryTypeEnum | undefined,
): Promise<ImportRowPreview> {
  const outcomes: ImportRowOutcome[] = [];
  const importedRows: ECRFImportResult["rows"] = [];
  const reviewRows = findReviewRows(importResult);
  const pending = new Map(
    findPendingRows(importResult).map((row) => [row.rowIndex, row]),
  );

  for (const row of importResult.rows) {
    const outcome = {
      rowNumber: excelRowNumber(row.rowIndex, row.sourceRowNumber),
      gpcRefNo: row.gpcRefNo || null,
      sourceLabel: row.sourceLabel ?? null,
      notationKey: row.notationKey ?? null,
    };
    if (row.errors?.length) {
      outcomes.push({
        ...outcome,
        status: "skipped",
        issue: row.issue ?? "invalid-row",
      });
      continue;
    }
    const skipReason = importRowSkipReason(row);
    if (skipReason) {
      outcomes.push({ ...outcome, status: "skipped", issue: skipReason });
      continue;
    }
    importedRows.push(row);
  }

  // Imported rows the inventory type does not require are stored but not counted.
  let omittedFromTotalTonnes = 0;
  const outsideReferences = new Set(
    await InventoryProgressService.findReferencesOutsideInventoryType(
      inventoryType,
      importedRows.map((row) => row.gpcRefNo),
    ),
  );
  for (const row of importedRows) {
    const held = pending.get(row.rowIndex);
    if (held) {
      outcomes.push({
        rowNumber: excelRowNumber(row.rowIndex, row.sourceRowNumber),
        gpcRefNo: row.gpcRefNo,
        sourceLabel: null,
        notationKey: row.notationKey ?? null,
        status: "pending",
        issue: held.issue,
      });
      continue;
    }
    // A wrong III.x.3 drops an amount from the total, so reviewers must see it.
    const issue = isImportedWasteRef(row.gpcRefNo)
      ? "omitted-from-total"
      : isOmittedGPCReference(row.gpcRefNo)
        ? "reported-apart-from-total"
        : outsideReferences.has(row.gpcRefNo)
          ? "outside-inventory-type"
          : null;
    if (issue) {
      const leftOutOfTotal =
        issue === "omitted-from-total" || issue === "reported-apart-from-total";
      const tonnes = leftOutOfTotal
        ? (resolveImportedTotalCO2e(row) ?? null)
        : null;
      if (tonnes != null) omittedFromTotalTonnes += tonnes;
      outcomes.push({
        rowNumber: excelRowNumber(row.rowIndex, row.sourceRowNumber),
        gpcRefNo: row.gpcRefNo,
        sourceLabel: null,
        notationKey: row.notationKey ?? null,
        status: "not-counted",
        issue,
        tonnes,
      });
    }
  }

  outcomes.sort((a, b) => a.rowNumber - b.rowNumber);

  const skippedByIssue: ImportRowPreview["skippedByIssue"] = {};
  for (const outcome of outcomes) {
    if (outcome.status !== "skipped") continue;
    skippedByIssue[outcome.issue] = (skippedByIssue[outcome.issue] ?? 0) + 1;
  }

  return {
    totalRows: importResult.rows.length,
    importedRows: importedRows.length,
    skippedRows: importResult.rows.length - importedRows.length,
    skippedByIssue,
    pendingRows: pending.size,
    reviewRows,
    scopeWarnings: importedRows
      .filter((row) => row.review && scopeFromLabel(row.review.scope) == null)
      .map((row) => ({
        rowNumber: excelRowNumber(row.rowIndex, row.sourceRowNumber),
        gpcRefNo: row.gpcRefNo,
        scope: row.review?.scope ?? null,
      })),
    // Rows held for a decision are listed in reviewRows, not here.
    inferredScopeRows: importedRows
      .filter(
        (row) =>
          row.review?.scopeSource === "inferred" && !pending.has(row.rowIndex),
      )
      .map((row) => {
        const scope = row.review?.scope ?? null;
        const original = row.review?.originalScope?.trim() || null;
        // "Scope 2" and "2" are the same scope, so compare normalized values.
        const differs =
          original != null &&
          scopeFromLabel(original) !== scopeFromLabel(scope);
        return {
          rowNumber: excelRowNumber(row.rowIndex, row.sourceRowNumber),
          gpcRefNo: row.gpcRefNo,
          scope,
          originalScope: differs ? original : null,
        };
      }),
    omittedFromTotalTonnes,
    rows: outcomes,
  };
}
