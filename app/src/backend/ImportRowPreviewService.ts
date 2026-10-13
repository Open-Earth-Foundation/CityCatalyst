import type { ECRFImportResult } from "@/backend/ECRFImportService";
import { importRowSkipReason } from "@/backend/InventoryImportService";
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
  const outsideReferences = new Set(
    await InventoryProgressService.findReferencesOutsideInventoryType(
      inventoryType,
      importedRows.map((row) => row.gpcRefNo),
    ),
  );
  for (const row of importedRows) {
    if (outsideReferences.has(row.gpcRefNo)) {
      outcomes.push({
        rowNumber: row.sourceRowNumber ?? row.rowIndex + 1,
        gpcRefNo: row.gpcRefNo,
        sourceLabel: null,
        notationKey: row.notationKey ?? null,
        status: "not-counted",
        issue: "outside-inventory-type",
      });
    }
  }

  outcomes.sort((a, b) => a.rowNumber - b.rowNumber);
  return {
    totalRows: importResult.rows.length,
    importedRows: importedRows.length,
    skippedRows: importResult.rows.length - importedRows.length,
    rows: outcomes,
  };
}
