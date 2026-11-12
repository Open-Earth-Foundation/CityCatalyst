import { describe, expect, it } from "@jest/globals";
import {
  defaultNumberStyleForCountry,
  numberFormatConflict,
  resolveNumberStyle,
  sourceMetadataSchema,
} from "@/util/GHGI/source-metadata";

describe("defaultNumberStyleForCountry", () => {
  it("maps countries case-insensitively", () => {
    expect(defaultNumberStyleForCountry("br")).toBe("european");
    expect(defaultNumberStyleForCountry("NZ")).toBe("english");
    expect(defaultNumberStyleForCountry("XX")).toBeNull();
    expect(defaultNumberStyleForCountry(null)).toBeNull();
    expect(defaultNumberStyleForCountry(undefined)).toBeNull();
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
    expect(
      sourceMetadataSchema.safeParse({
        numberFormat: "english",
        numberFormatSource: "user",
        reportedTotal: 10,
        reportedTotalKind: "net",
      }).success,
    ).toBe(true);
  });

  it("accepts a negative net total, rejects a negative gross or zero net", () => {
    const base = { numberFormat: null, numberFormatSource: null };
    expect(
      sourceMetadataSchema.safeParse({
        ...base,
        reportedTotal: -25639,
        reportedTotalKind: "net",
      }).success,
    ).toBe(true);
    expect(
      sourceMetadataSchema.safeParse({
        ...base,
        reportedTotal: -25639,
        reportedTotalKind: "gross",
      }).success,
    ).toBe(false);
    expect(
      sourceMetadataSchema.safeParse({
        ...base,
        reportedTotal: 0,
        reportedTotalKind: "net",
      }).success,
    ).toBe(false);
    expect(
      sourceMetadataSchema.safeParse({
        reportedTotal: 0,
        reportedTotalKind: "gross",
      }).success,
    ).toBe(false);
  });

  it("strips a stored pages key from old metadata", () => {
    const parsed = sourceMetadataSchema.safeParse({
      numberFormat: "english",
      numberFormatSource: "user",
      reportedTotal: 10,
      reportedTotalKind: "net",
      pages: [40, 41],
    });
    expect(parsed.success).toBe(true);
    expect(parsed.success && "pages" in parsed.data).toBe(false);
  });
});
