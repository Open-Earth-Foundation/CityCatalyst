/**
 * Maps the rows of a precomputed extraction envelope to ExtractedRow, field by
 * field, with no repair or inference. The runner stores the rows and calls the
 * real approve step.
 *
 * Approve cannot carry `total_inclusion` (`omitFromTotal` is set only by the
 * InventoryValue model hook from fixed references), so an `excluded` row is
 * mapped as included and counted in `droppedRows.excludedNotCarried`. Approve
 * also ignores rowType, unit, scope and category; a subsector reference with a
 * null scope is mapped as given and dropped by approve later.
 */
import type { ExtractedRow } from "@/backend/InventoryExtractionService";
import type { PipelineAttempt } from "@/backend/ingestion-benchmark/report";
import type { ReadEnvelope } from "@/backend/ingestion-benchmark/pipelines/rows-dir";
import { toCanonical } from "@/util/notation-keys";

export type MappedEnvelope =
  | {
      rows: ExtractedRow[];
      attempt: Omit<PipelineAttempt, "costUsd" | "costSource" | "usage">;
    }
  | { failure: "extraction_error"; message: string };

const bump = (tally: Record<string, number>, key: string) => {
  tally[key] = (tally[key] ?? 0) + 1;
};

export function mapEnvelope(envelope: ReadEnvelope): MappedEnvelope {
  if (envelope.executionStatus !== "completed") {
    return {
      failure: "extraction_error",
      message: `execution status ${envelope.executionStatus}`,
    };
  }
  const { data } = envelope;
  const rows: ExtractedRow[] = [];
  const unknownRowRoles: Record<string, number> = {};
  const droppedRows: Record<string, number> = {};
  const rowRoles: Record<string, number> = {};
  const scopeBasis: Record<string, number> = {};
  const totalInclusion: Record<string, number> = {};

  for (const r of data.rows) {
    bump(rowRoles, r.row_role);
    bump(scopeBasis, r.scope_basis);
    bump(totalInclusion, r.total_inclusion);

    if (r.row_role === "information") {
      bump(droppedRows, "information");
      continue;
    }
    if (!["emission", "removal", "notation"].includes(r.row_role)) {
      bump(unknownRowRoles, r.row_role);
      continue;
    }
    if (r.total_inclusion === "excluded")
      bump(droppedRows, "excludedNotCarried");

    rows.push({
      year: data.reporting_year,
      sector: null,
      subsector: null,
      category: r.source_label,
      totalCO2e: r.row_role === "notation" ? null : r.emissions_tco2e,
      unit: "tCO2e",
      gpcRefNo: r.gpc_ref,
      scope: r.scope === null ? null : String(r.scope),
      notationKey: toCanonical(r.notation_key),
      rowType: "line_item",
    });
  }

  return {
    rows,
    attempt: {
      executionStatus: envelope.executionStatus,
      rowsInEnvelope: data.rows.length,
      unknownRowRoles,
      droppedRows,
      rowRoles,
      scopeBasis,
      totalInclusion,
      reported: {
        totalT: data.reported_total_tco2e,
        grossT: data.reported_gross_total_tco2e,
        netT: data.reported_net_total_tco2e,
        removalsT: data.reported_removals_tco2e,
        totalBasis: data.total_basis,
        totalKind: data.total_kind,
      },
    },
  };
}
