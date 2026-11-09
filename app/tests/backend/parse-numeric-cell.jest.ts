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
    expect(parseNumericCell("1.234.567")).toBe(1234567);
    expect(parseNumericCell("1,234,567")).toBe(1234567);
  });

  it("keeps a single group of three digits as a decimal fraction", () => {
    expect(parseNumericCell("137.224")).toBe(137.224);
    expect(parseNumericCell("0.123")).toBe(0.123);
    expect(parseNumericCell("57.828")).toBe(57.828);
    expect(parseNumericCell("721.633")).toBe(721.633);
    expect(parseNumericCell("1185.614")).toBe(1185.614);
    expect(parseNumericCell("-3319.081")).toBe(-3319.081);
    expect(parseNumericCell("224000.0")).toBe(224000);
    expect(parseNumericCell("57,828")).toBe(57.828);
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
