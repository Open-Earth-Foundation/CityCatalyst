import { describe, expect, it } from "@jest/globals";
import { mapEnvelope } from "@/backend/ingestion-benchmark/pipelines/map-envelope";
import type {
  EnvelopeRow,
  ReadEnvelope,
} from "@/backend/ingestion-benchmark/pipelines/rows-dir";

const row = (over: Partial<EnvelopeRow> = {}): EnvelopeRow => ({
  source_label: "Synthetic label",
  gpc_ref: "I.1.1",
  scope: 1,
  emissions_tco2e: 10,
  notation_key: null,
  row_role: "emission",
  total_inclusion: "included",
  scope_basis: "explicit",
  ...over,
});

const envelope = (
  rows: EnvelopeRow[],
  over: Partial<ReadEnvelope> = {},
  data: Partial<ReadEnvelope["data"]> = {},
): ReadEnvelope => ({
  data: {
    reporting_year: 2020,
    reported_total_tco2e: 100,
    total_basis: "basis",
    reported_gross_total_tco2e: 110,
    reported_net_total_tco2e: 90,
    reported_removals_tco2e: 20,
    total_kind: "gross",
    reconciliation_tolerance_tco2e: null,
    rows,
    ...data,
  },
  usage: {},
  executionStatus: "completed",
  info: {
    id: "precomputed",
    study: null,
    stage: null,
    mode: null,
    version: null,
  },
  costUsd: null,
  ...over,
});

const ok = (e: ReadEnvelope) => {
  const result = mapEnvelope(e);
  if ("failure" in result) throw new Error("unexpected failure");
  return result;
};

describe("mapEnvelope", () => {
  it("maps an emission row field by field", () => {
    const { rows } = ok(envelope([row({ scope: 2, gpc_ref: "I.2.1" })]));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      year: 2020,
      sector: null,
      subsector: null,
      category: "Synthetic label",
      totalCO2e: 10,
      unit: "tCO2e",
      gpcRefNo: "I.2.1",
      scope: "2",
      notationKey: null,
      rowType: "line_item",
    });
  });

  it("maps a null scope to null and keeps a subsector ref as given", () => {
    const { rows } = ok(envelope([row({ scope: null, gpc_ref: "I.3" })]));
    expect(rows[0].scope).toBeNull();
    expect(rows[0].gpcRefNo).toBe("I.3");
  });

  it("keeps removal values as given, without a sign change", () => {
    const { rows } = ok(
      envelope([row({ row_role: "removal", emissions_tco2e: -5 })]),
    );
    expect(rows[0].totalCO2e).toBe(-5);
  });

  it("maps a notation row with null totalCO2e and a canonical key", () => {
    const { rows } = ok(
      envelope([
        row({ row_role: "notation", emissions_tco2e: 7, notation_key: "NE" }),
      ]),
    );
    expect(rows[0].totalCO2e).toBeNull();
    expect(rows[0].notationKey).toBe("not-estimated");
  });

  it("drops information rows and counts them", () => {
    const result = ok(envelope([row(), row({ row_role: "information" })]));
    expect(result.rows).toHaveLength(1);
    expect(result.attempt.droppedRows.information).toBe(1);
    expect(result.attempt.rowsInEnvelope).toBe(2);
  });

  it("drops an unknown role and counts it by value", () => {
    const result = ok(
      envelope([row({ row_role: "mystery" }), row({ row_role: "mystery" })]),
    );
    expect(result.rows).toHaveLength(0);
    expect(result.attempt.unknownRowRoles).toEqual({ mystery: 2 });
  });

  it("maps excluded rows as included and counts them as not carried", () => {
    const result = ok(envelope([row({ total_inclusion: "excluded" }), row()]));
    expect(result.rows).toHaveLength(2);
    expect(result.attempt.droppedRows.excludedNotCarried).toBe(1);
    expect(result.attempt.totalInclusion).toEqual({ excluded: 1, included: 1 });
  });

  it("maps unclear rows as included and tallies them", () => {
    const result = ok(envelope([row({ total_inclusion: "unclear" })]));
    expect(result.rows).toHaveLength(1);
    expect(result.attempt.totalInclusion.unclear).toBe(1);
    expect(result.attempt.droppedRows.excludedNotCarried ?? 0).toBe(0);
  });

  it("tallies row roles and scope basis and copies reported totals", () => {
    const { attempt } = ok(
      envelope([
        row(),
        row({ scope_basis: "inferred" }),
        row({ row_role: "removal" }),
      ]),
    );
    expect(attempt.rowRoles).toEqual({ emission: 2, removal: 1 });
    expect(attempt.scopeBasis).toEqual({ explicit: 2, inferred: 1 });
    expect(attempt.executionStatus).toBe("completed");
    expect(attempt.reported).toEqual({
      totalT: 100,
      grossT: 110,
      netT: 90,
      removalsT: 20,
      totalBasis: "basis",
      totalKind: "gross",
    });
  });

  it("returns an empty row list for an empty envelope", () => {
    const result = ok(envelope([]));
    expect(result.rows).toEqual([]);
    expect(result.attempt.rowsInEnvelope).toBe(0);
  });

  it("fails when the execution status is not completed", () => {
    const result = mapEnvelope(
      envelope([row()], { executionStatus: "failed" }),
    );
    expect(result).toMatchObject({ failure: "extraction_error" });
    expect("message" in result && result.message).toContain("failed");
  });
});
