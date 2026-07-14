/**
 * Unit tests for Path B interpret helpers (pure decisions, no LLM).
 */
import {
  detectedColumnsMatchECRFStructure,
  shouldSkipInterpretForAdapter,
} from "@/backend/AIInterpretationService";

describe("shouldSkipInterpretForAdapter", () => {
  it("skips interpret for FormatAdapter tidy types", () => {
    expect(shouldSkipInterpretForAdapter("long-tidy")).toBe(true);
    expect(shouldSkipInterpretForAdapter("wide-year")).toBe(true);
    expect(shouldSkipInterpretForAdapter("multi-sheet")).toBe(true);
  });

  it("does not skip for near-ecrf, unknown, or empty", () => {
    expect(shouldSkipInterpretForAdapter("near-ecrf")).toBe(false);
    expect(shouldSkipInterpretForAdapter(null)).toBe(false);
    expect(shouldSkipInterpretForAdapter(undefined)).toBe(false);
    expect(shouldSkipInterpretForAdapter("")).toBe(false);
    expect(shouldSkipInterpretForAdapter("other")).toBe(false);
  });
});

describe("detectedColumnsMatchECRFStructure", () => {
  it("requires identity, scope, and a gas column", () => {
    expect(
      detectedColumnsMatchECRFStructure({
        sector: 0,
        subsector: 1,
        scope: 2,
        totalCO2e: 3,
      }),
    ).toBe(true);
    expect(
      detectedColumnsMatchECRFStructure({
        gpcRefNo: 0,
        scope: 1,
        co2: 2,
      }),
    ).toBe(true);
    expect(
      detectedColumnsMatchECRFStructure({
        sector: 0,
        subsector: 1,
        totalCO2e: 2,
      }),
    ).toBe(false);
  });
});
