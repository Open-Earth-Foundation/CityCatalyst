import {
  isImportedWasteRef,
  isOmittedFromTotalRef,
} from "@/util/GHGI/reported-totals";
import type { ECRFImportResult } from "@/backend/ECRFImportService";
import {
  importRowSkipReason,
  resolveImportedTotalCO2e,
} from "@/backend/InventoryImportService";
import InventoryProgressService from "@/backend/InventoryProgressService";
import type { InventoryTypeEnum } from "@/util/enums";
import type { ImportRowOutcome, ImportRowPreview } from "@/util/types";

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
  let omittedFromTotalTonnes = 0;
  const outsideReferences = new Set(
    await InventoryProgressService.findReferencesOutsideInventoryType(
      inventoryType,
      importedRows.map((row) => row.gpcRefNo),
    ),
  );
  for (const row of importedRows) {
    // A wrong III.x.3 drops an amount from the total, so reviewers must see it.
    const issue = isImportedWasteRef(row.gpcRefNo)
      ? "omitted-from-total"
      : isOmittedFromTotalRef(row.gpcRefNo)
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
        rowNumber: row.sourceRowNumber ?? row.rowIndex + 1,
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
    omittedFromTotalTonnes,
    rows: outcomes,
  };
}
