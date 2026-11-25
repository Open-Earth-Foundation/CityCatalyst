export interface IngestSourcePointer {
  file: string;
  sheet?: string | null;
  page?: number | null;
  row?: number | null;
  column?: string | null;
}

export interface IngestSourceOccupancy {
  pointer: IngestSourcePointer;
  /** Raw text at that pointer. Core compares this to proposed values. */
  raw: string;
}

export interface IngestProposedCommitValue {
  pointer: IngestSourcePointer;
  raw: string;
}

export interface IngestSkippedSourceRow {
  pointer: IngestSourcePointer;
  reason: string;
}

export interface IngestSourceReconciliationInput {
  sourceRowCount: number;
  occupancy: IngestSourceOccupancy[];
  proposed: IngestProposedCommitValue[];
  skipped: IngestSkippedSourceRow[];
}

export interface IngestReconciliationIssue {
  code:
    | "extra_value"
    | "value_not_in_source"
    | "missing_row"
    | "skip_without_reason"
    | "double_counted"
    | "count_mismatch";
  message: string;
  pointer?: IngestSourcePointer;
}

export interface IngestSourceReconciliationReport {
  ok: boolean;
  sourceRowCount: number;
  importedCount: number;
  skippedCount: number;
  issues: IngestReconciliationIssue[];
  proposed: IngestProposedCommitValue[];
  skipped: IngestSkippedSourceRow[];
}

export function ingestRowKey(pointer: IngestSourcePointer): string {
  return [
    pointer.file,
    pointer.sheet ?? "",
    pointer.page ?? "",
    pointer.row ?? "",
  ].join("|");
}

export function ingestCellKey(pointer: IngestSourcePointer): string {
  return ingestRowKey(pointer) + "|" + (pointer.column ?? "");
}

/**
 * Core check. The plugin names source cells and how commit values point
 * back at them; Core does not read domain columns.
 */
export function reconcileIngestSource(
  input: IngestSourceReconciliationInput,
): IngestSourceReconciliationReport {
  const occupancyByCell = new Map<string, string>();
  const occupancyRows = new Set<string>();
  for (const cell of input.occupancy) {
    occupancyByCell.set(ingestCellKey(cell.pointer), cell.raw);
    occupancyRows.add(ingestRowKey(cell.pointer));
  }

  const issues: IngestReconciliationIssue[] = [];
  const importedRows = new Set<string>();

  for (const value of input.proposed) {
    const cellKey = ingestCellKey(value.pointer);
    const rowKey = ingestRowKey(value.pointer);
    const sourceRaw = occupancyByCell.get(cellKey);
    if (sourceRaw === undefined) {
      issues.push({
        code: "extra_value",
        message: "Proposed value is not in the source file",
        pointer: value.pointer,
      });
      continue;
    }
    if (sourceRaw !== value.raw) {
      issues.push({
        code: "value_not_in_source",
        message: "Proposed value does not match the source at this pointer",
        pointer: value.pointer,
      });
      continue;
    }
    importedRows.add(rowKey);
  }

  const skippedRows = new Set<string>();
  for (const skipped of input.skipped) {
    if (!skipped.reason.trim()) {
      issues.push({
        code: "skip_without_reason",
        message: "Skipped source row has no reason",
        pointer: skipped.pointer,
      });
    }
    const rowKey = ingestRowKey(skipped.pointer);
    if (!occupancyRows.has(rowKey)) {
      issues.push({
        code: "extra_value",
        message: "Skipped row is not in the source file",
        pointer: skipped.pointer,
      });
    }
    skippedRows.add(rowKey);
  }

  for (const rowKey of importedRows) {
    if (skippedRows.has(rowKey)) {
      issues.push({
        code: "double_counted",
        message: "Source row is both imported and skipped",
      });
    }
  }

  for (const rowKey of occupancyRows) {
    if (!importedRows.has(rowKey) && !skippedRows.has(rowKey)) {
      issues.push({
        code: "missing_row",
        message: "Source row is neither imported nor skipped",
      });
    }
  }

  const importedCount = importedRows.size;
  const skippedCount = skippedRows.size;
  if (input.sourceRowCount !== importedCount + skippedCount) {
    issues.push({
      code: "count_mismatch",
      message: `Source rows (${input.sourceRowCount}) must equal imported (${importedCount}) plus skipped (${skippedCount})`,
    });
  }
  if (input.sourceRowCount !== occupancyRows.size) {
    issues.push({
      code: "count_mismatch",
      message: `Declared sourceRowCount (${input.sourceRowCount}) does not match occupancy (${occupancyRows.size})`,
    });
  }

  return {
    ok: issues.length === 0,
    sourceRowCount: input.sourceRowCount,
    importedCount,
    skippedCount,
    issues,
    proposed: input.proposed,
    skipped: input.skipped,
  };
}
