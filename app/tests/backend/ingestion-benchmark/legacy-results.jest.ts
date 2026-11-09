import { describe, expect, it } from "@jest/globals";
import {
  adaptLegacyCase,
  adaptLegacySummary,
} from "@/backend/ingestion-benchmark/legacy-results";
import type { CaseManifestEntry } from "@/backend/ingestion-benchmark/selection";

const manifest: CaseManifestEntry[] = [
  {
    id: "C-007a",
    city: "Miami",
    country: "USA",
    year: 2019,
    block: "validated",
    totalOnly: false,
    textTables: true,
    fileName: "Miami.pdf",
  },
  {
    id: "C-006",
    city: "Seattle",
    country: "USA",
    year: 2022,
    block: "held-out",
    totalOnly: true,
    textTables: true,
    fileName: "Seattle.pdf",
  },
];

const legacyCase = (id: string) => ({
  id,
  file: "x.pdf",
  kind: "pdf",
  targetYear: 2019,
  keyId: id,
  ocr: { ok: true },
  productFlowFailsAtOcr: false,
  stableTotal: true,
  runs: [
    { run: 1, ok: true, ms: 1000, score: { rowRecall: 1 } as never },
    { run: 2, ok: false, ms: 500, message: "boom" },
  ],
});

describe("adaptLegacyCase", () => {
  it("fills the fields the earlier harness did not write", () => {
    const result = adaptLegacyCase(legacyCase("c-007A"), manifest);
    expect(result.block).toBe("validated");
    expect(result.eligible).toBe(true);
    expect(result.totalOnly).toBe(false);
    expect(result.runs[0]).toMatchObject({
      failureMode: "scored",
      warnings: [],
      stageMs: { ocr: null, extraction: null, import: null, total: 1000 },
    });
    expect(result.runs[0].zeroRowsReason).toBeUndefined();
    expect(result.runs[1].failureMode).toBe("extraction_error");
  });

  it("takes totalOnly and block from the manifest, and eligible is null for total-only cases", () => {
    const result = adaptLegacyCase(legacyCase("C-006"), manifest);
    expect(result).toMatchObject({
      block: "held-out",
      totalOnly: true,
      eligible: null,
    });
  });

  it("keeps fields the file already has", () => {
    const raw = {
      ...legacyCase("C-007a"),
      block: "dev" as const,
      eligible: false,
      totalOnly: true,
    };
    raw.runs[0] = { ...raw.runs[0], failureMode: "truncated" } as never;
    const result = adaptLegacyCase(raw, manifest);
    expect(result).toMatchObject({
      block: "dev",
      eligible: false,
      totalOnly: true,
    });
    expect(result.runs[0].failureMode).toBe("truncated");
  });

  it("falls back to the held-out list when the manifest lacks the case", () => {
    const result = adaptLegacyCase(legacyCase("C-099"), manifest, ["C-099"]);
    expect(result).toMatchObject({
      block: "held-out",
      eligible: null,
      totalOnly: false,
    });
  });
});

describe("adaptLegacySummary", () => {
  it("adapts every case", () => {
    const results = adaptLegacySummary(
      {
        measuredAt: "2026-10-31T04:18:42.240Z",
        commit: "abc",
        results: [legacyCase("C-007a"), legacyCase("C-006")],
      },
      manifest,
    );
    expect(results.map((r) => r.id)).toEqual(["C-007a", "C-006"]);
  });
});
