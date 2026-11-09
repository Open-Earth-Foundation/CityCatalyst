import { detectNumberStyle, parseNumberString } from "@/util/GHGI/source-text";
import type { NumberStyle } from "@/util/GHGI/source-text";

describe("parseNumberString", () => {
  it.each<[string, NumberStyle, number | null]>([
    ["1,5", "unknown", 1.5],
    ["1,500", "unknown", 1500],
    ["1.500", "unknown", 1.5],
    ["1,500", "english", 1500],
    ["1.500", "european", 1500],
    ["1,500", "european", 1.5],
    ["1.234,5", "english", 1234.5],
    ["1,234.5", "european", 1234.5],
    ["1,234,567", "european", 1234567],
    ["1.234.567", "english", 1234567],
    ["(1,234)", "unknown", -1234],
    ["−603,983", "unknown", -603983],
    ["-603,983", "unknown", -603983],
    ["1 234,5", "european", 1234.5],
    ["9 559 215", "unknown", 9559215],
    ["12,25", "unknown", 12.25],
    ["abc", "unknown", null],
    ["1,2,3.4.5", "unknown", null],
  ])("parses %j with style %s as %s", (input, style, expected) => {
    expect(parseNumberString(input, style)).toBe(expected);
  });
});

describe("detectNumberStyle", () => {
  it("detects european", () => {
    expect(detectNumberStyle("Total 1.234.567 und 2.345,6")).toBe("european");
  });
  it("detects english", () => {
    expect(detectNumberStyle("Total 1,234,567 and 2,345.6")).toBe("english");
  });
  it("is unknown without evidence", () => {
    expect(detectNumberStyle("Total 48 and 12")).toBe("unknown");
  });
  it("is unknown on a tie", () => {
    expect(detectNumberStyle("1.234.567 and 1,234,567")).toBe("unknown");
  });
});
