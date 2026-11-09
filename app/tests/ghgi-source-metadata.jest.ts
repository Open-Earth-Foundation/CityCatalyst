import { describe, expect, it } from "@jest/globals";
import {
  defaultNumberStyleForCountry,
  numberFormatConflict,
  parsePageList,
  resolveNumberStyle,
  sourceMetadataSchema,
} from "@/util/GHGI/source-metadata";

const range = (a: number, b: number) =>
  Array.from({ length: b - a + 1 }, (_, i) => a + i);

describe("defaultNumberStyleForCountry", () => {
  it("maps countries case-insensitively", () => {
    expect(defaultNumberStyleForCountry("br")).toBe("european");
    expect(defaultNumberStyleForCountry("NZ")).toBe("english");
    expect(defaultNumberStyleForCountry("XX")).toBeNull();
    expect(defaultNumberStyleForCountry(null)).toBeNull();
    expect(defaultNumberStyleForCountry(undefined)).toBeNull();
  });
});

describe("parsePageList", () => {
  it("parses numbers and ranges", () => {
    expect(parsePageList("40-55")).toEqual(range(40, 55));
    expect(parsePageList(" 40-45, 52 ")).toEqual([40, 41, 42, 43, 44, 45, 52]);
    expect(parsePageList("40, 40-42")).toEqual([40, 41, 42]);
  });
  it("rejects invalid input", () => {
    expect(parsePageList("55-40")).toBeNull();
    expect(parsePageList("0")).toBeNull();
    expect(parsePageList("p40")).toBeNull();
    expect(parsePageList("")).toBeNull();
    expect(parsePageList("1-2001")).toBeNull();
  });
});

describe("resolveNumberStyle and numberFormatConflict", () => {
  const eu = "| A | 1.234.567 |\n| B | 2.345.678 |\n| C | 3.456.789 |";
  it("resolves the style", () => {
    expect(
      resolveNumberStyle(eu, {
        numberFormat: "english",
        numberFormatSource: "user",
      }),
    ).toBe("english");
    expect(
      resolveNumberStyle(eu, {
        numberFormat: "english",
        numberFormatSource: "country_default",
      }),
    ).toBe("european");
    expect(
      resolveNumberStyle("| A | 1,500 |", {
        numberFormat: "european",
        numberFormatSource: "country_default",
      }),
    ).toBe("european");
    expect(resolveNumberStyle(eu, null)).toBe("european");
  });
  it("reports conflicts only for user format", () => {
    expect(
      numberFormatConflict(eu, {
        numberFormat: "english",
        numberFormatSource: "user",
      }),
    ).toEqual({ chosen: "english", detected: "european" });
    expect(
      numberFormatConflict(eu, {
        numberFormat: "english",
        numberFormatSource: "country_default",
      }),
    ).toBeNull();
    expect(
      numberFormatConflict("| A | 1.234.567 |", {
        numberFormat: "english",
        numberFormatSource: "user",
      }),
    ).toBeNull();
  });
});

describe("sourceMetadataSchema", () => {
  it("fills missing keys with null and enforces refinements", () => {
    expect(sourceMetadataSchema.parse({})).toEqual({
      numberFormat: null,
      numberFormatSource: null,
      reportedTotal: null,
      reportedTotalKind: null,
      pages: null,
    });
    expect(
      sourceMetadataSchema.safeParse({ numberFormat: "english" }).success,
    ).toBe(false);
    expect(
      sourceMetadataSchema.safeParse({ numberFormatSource: "user" }).success,
    ).toBe(false);
    expect(
      sourceMetadataSchema.safeParse({ reportedTotalKind: "gross" }).success,
    ).toBe(false);
    expect(
      sourceMetadataSchema.safeParse({
        reportedTotal: -1,
        reportedTotalKind: "gross",
      }).success,
    ).toBe(false);
    expect(sourceMetadataSchema.safeParse({ pages: [0] }).success).toBe(false);
    expect(
      sourceMetadataSchema.safeParse({
        numberFormat: "english",
        numberFormatSource: "user",
        reportedTotal: 10,
        reportedTotalKind: "net",
        pages: [1, 2],
      }).success,
    ).toBe(true);
  });
});
