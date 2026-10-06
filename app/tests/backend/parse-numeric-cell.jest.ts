import { describe, expect, it } from "@jest/globals";
import {
  hasSignedNumericValue,
  parseNumericCell,
} from "@/util/parse-numeric-cell";

describe("parseNumericCell", () => {
  it("keeps ASCII negative tonnes", () => {
    expect(parseNumericCell(-239.5)).toBe(-239.5);
    expect(parseNumericCell("-239.5")).toBe(-239.5);
  });

  it("parses unicode minus, en-dash, and accounting parentheses", () => {
    expect(parseNumericCell("−239.5")).toBe(-239.5);
    expect(parseNumericCell("–239.5")).toBe(-239.5);
    expect(parseNumericCell("(239.5)")).toBe(-239.5);
  });

  it("parses European comma decimals and thousands separators", () => {
    expect(parseNumericCell("-239,5")).toBe(-239.5);
    expect(parseNumericCell("1.234,56")).toBe(1234.56);
    expect(parseNumericCell("1,234.56")).toBe(1234.56);
  });

  it("returns 0 for zero and undefined for empty / dash", () => {
    expect(parseNumericCell(0)).toBe(0);
    expect(parseNumericCell("0")).toBe(0);
    expect(parseNumericCell("")).toBeUndefined();
    expect(parseNumericCell("-")).toBeUndefined();
    expect(parseNumericCell(null)).toBeUndefined();
  });
});

describe("hasSignedNumericValue", () => {
  it("treats negatives as present and 0 as empty", () => {
    expect(hasSignedNumericValue(-239.5)).toBe(true);
    expect(hasSignedNumericValue(0)).toBe(false);
    expect(hasSignedNumericValue(undefined)).toBe(false);
  });
});
