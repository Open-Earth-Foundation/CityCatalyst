import { describe, expect, it } from "@jest/globals";
import { isScored, parseNumbers, parseTolerance } from "./export-answer-keys";

describe("isScored", () => {
  it("treats a blank Value row as scored and only an explicit No as not", () => {
    expect(isScored("", "Value")).toBe(true);
    expect(isScored("", "Value (not in total)")).toBe(true);
    expect(isScored("Yes", "Value")).toBe(true);
    expect(isScored("No", "Value (not in total)")).toBe(false);
  });

  it("does not score blank notation keys", () => {
    expect(isScored("", "Notation key")).toBe(false);
    expect(isScored("Yes", "Notation key")).toBe(true);
  });
});

describe("parseTolerance", () => {
  it("reads a separate total tolerance", () => {
    expect(parseTolerance("±1 t (integers); total ±2 t")).toEqual({
      tolerance: 1,
      totalTolerance: 2,
    });
  });

  it("does not read a total quoted in a note as the tolerance", () => {
    expect(
      parseTolerance("±25 t (text total 23,787,113 excludes aviation)"),
    ).toEqual({ tolerance: 25, totalTolerance: 25 });
  });
});

describe("parseNumbers", () => {
  it("reads European thousands separators", () => {
    expect(parseNumbers("3.505.046; 126.987")).toEqual([3505046, 126987]);
    expect(parseNumbers("Providencia 1.100 (kt)")).toEqual([1100]);
  });

  it("reads European decimals and English separators", () => {
    expect(parseNumbers("33.904,2 kt")).toEqual([33904.2]);
    expect(parseNumbers("TOTAL 3,262,279.10")).toEqual([3262279.1]);
    expect(parseNumbers("2.76 and 6,4")).toEqual([2.76, 6.4]);
  });

  it("keeps plain integers", () => {
    expect(parseNumbers("Pirque 133; 270.707 hab")).toEqual([133, 270707]);
  });
});
