import {
  isImportedWasteRef,
  isOmittedFromTotalRef,
} from "@/util/GHGI/reported-totals";
import type { ECRFImportResult } from "@/backend/ECRFImportService";
import { importRowSkipReason } from "@/backend/InventoryImportService";
import InventoryProgressService from "@/backend/InventoryProgressService";
import type { InventoryTypeEnum } from "@/util/enums";
import { siblingReferences, taxonomyScope } from "@/util/GHGI/gpc-ref-resolver";
import type {
  ImportRowIssue,
  ImportRowOutcome,
  ImportRowPreview,
  ImportRowReview,
} from "@/util/types";

type ImportRow = ECRFImportResult["rows"][number];

/** Taxonomy scope, when the row states a different one. */
function conflictingScope(row: ImportRow): number | null {
  const stated = Number(row.review?.scope);
  const expected = taxonomyScope(row.gpcRefNo);
  return expected != null && stated > 0 && stated !== expected
    ? expected
    : null;
}

/**
 * Why a row needs a user decision, or null. Rows reviewed so far include those
 * already decided, so the list stays on screen and a decision can be changed.
 * Nothing here looks at the wording of a quote: a found quote proves the text
 * exists, so it never clears a row. Only a recorded decision does.
 */
function reviewIssue(row: ImportRow): ImportRowIssue | null {
  const ref = row.review?.suggestedRefNo ?? row.gpcRefNo;
  if (row.review?.refSource === "document") {
    return conflictingScope({ ...row, gpcRefNo: ref }) != null
      ? "reference-conflict"
      : null;
  }
  return isImportedWasteRef(ref) ? "direction-unconfirmed" : null;
}

function toReview(row: ImportRow, issue: ImportRowIssue): ImportRowReview {
  const review = row.review!;
  const suggestedRefNo = review.suggestedRefNo ?? row.gpcRefNo;
  const expectedScope = conflictingScope({ ...row, gpcRefNo: suggestedRefNo });
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
    expectedScope,
    quote: review.directionEvidence,
    quoteFound: review.directionEvidenceFound,
    page: review.page,
    source: review.source,
    decision: review.decision,
    referenceOptions: siblingReferences(suggestedRefNo),
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
  return findReviewRows(importResult).filter((row) => !row.decision);
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
    reviewRows.filter((row) => !row.decision).map((row) => [row.rowIndex, row]),
  );

  for (const row of importResult.rows) {
    const outcome = {
      rowNumber: row.sourceRowNumber ?? row.rowIndex + 1,
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
        rowNumber: row.sourceRowNumber ?? row.rowIndex + 1,
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
      : isOmittedFromTotalRef(row.gpcRefNo)
        ? "reported-apart-from-total"
        : outsideReferences.has(row.gpcRefNo)
          ? "outside-inventory-type"
          : null;
    if (issue) {
      outcomes.push({
        rowNumber: row.sourceRowNumber ?? row.rowIndex + 1,
        gpcRefNo: row.gpcRefNo,
        sourceLabel: null,
        notationKey: row.notationKey ?? null,
        status: "not-counted",
        issue,
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
    rows: outcomes,
  };
}
