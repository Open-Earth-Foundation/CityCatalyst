import { describe, expect, it } from "@jest/globals";
import * as sourceMetadata from "@/util/GHGI/source-metadata";
import {
  defaultNumberStyleForCountry,
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

describe("resolveNumberStyle", () => {
  const eu = "| A | 1.234.567 |\n| B | 2.345.678 |\n| C | 3.456.789 |";

  it("lets the document style win over the country default", () => {
    expect(
      resolveNumberStyle(eu, {
        numberFormat: "english",
        numberFormatSource: "country_default",
      }),
    ).toBe("european");
  });

  it("falls back to the country default only when the document style is unknown", () => {
    expect(
      resolveNumberStyle("| A | 1,500 |", {
        numberFormat: "european",
        numberFormatSource: "country_default",
      }),
    ).toBe("european");
    expect(resolveNumberStyle(eu, null)).toBe("european");
  });
});

describe("source metadata is the country default only", () => {
  it("no longer exports the user-format conflict check", () => {
    expect(sourceMetadata).not.toHaveProperty("numberFormatConflict");
  });

  it("accepts only the country_default source", () => {
    expect(
      sourceMetadataSchema.safeParse({
        numberFormat: "european",
        numberFormatSource: "country_default",
      }).success,
    ).toBe(true);
    expect(
      sourceMetadataSchema.safeParse({
        numberFormat: "english",
        numberFormatSource: "user",
      }).success,
    ).toBe(false);
    expect(sourceMetadataSchema.safeParse({}).success).toBe(false);
  });

  it("strips reported-total fields from old metadata", () => {
    const parsed = sourceMetadataSchema.safeParse({
      numberFormat: "english",
      numberFormatSource: "country_default",
      reportedTotal: 10,
      reportedTotalKind: "net",
    });
    expect(parsed.success).toBe(true);
    expect(parsed.success && Object.keys(parsed.data).sort()).toEqual([
      "numberFormat",
      "numberFormatSource",
    ]);
  });
});
