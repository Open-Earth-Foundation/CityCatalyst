import {
  detectNumberStyle,
  isValueInText,
  numbersInText,
  parseNumberString,
} from "@/util/GHGI/source-text";
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

describe("isValueInText", () => {
  it.each<[number, string, boolean]>([
    [9559215, "| TOTAL | 9,559,215 |", true],
    [9559215, "Total 9,559,215.4", true],
    // Scaled: the model converted kt to tonnes itself.
    [9559215, "(kt CO2e) Total 9,559.2", true],
    [-811512, "Forestry (811,512)", true],
    [-603983, "AFOLU −603,983", true],
    [5000000, "Total 4,876,120", false],
    [9559215, "about 9.56 million", false],
    // A short figure never matches scaled: the "2" of CO2e is not 2 Mt.
    [2000000, "CO2e emissions", false],
  ])("finds %s in %j: %s", (raw, text, expected) => {
    expect(isValueInText(raw, text)).toBe(expected);
  });
});

describe("numbersInText", () => {
  it("reads a space-grouped number merged and token by token", () => {
    const values = numbersInText("9 559 215", "unknown").map((n) => n.value);
    expect(values).toEqual(expect.arrayContaining([9559215, 9, 559, 215]));
  });

  it("gives the place value of the last digit as step", () => {
    expect(numbersInText("9,559.2", "english")).toEqual([
      { value: 9559.2, step: 0.1 },
    ]);
  });
});
