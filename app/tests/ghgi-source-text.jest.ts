import {
  detectNumberStyle,
  isValueInText,
  isValueInNumbers,
  numbersInText,
  parseNumberString,
  captionLines,
  tableCaptionLines,
  yearEvidence,
  namesLargeUnit,
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
    // Scaled down: the page prints kg and the model converted to tonnes
    // (Santiago 2022, CC-950 backtest 2026-11-09).
    [2145243.596, "| TOTAL DE EMISIONES (NETAS) | 2.145.243.596 |", true],
    [841891, "| Subtotal Transporte | 841.891.000 |", true],
    // A short kg figure never matches: 500 kg is not 0.5 t of a total.
    [0.5, "500 kg", false],
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

describe("captionLines", () => {
  const text = [
    "Intro prose that mentions Table 3 in the middle.",
    "**Table 2: Emissions (kt CO2e)**",
    "Figure 4 Emissions by sector",
    "## Summary",
    "(kt CO2e)",
    "Total GHGs (metric tonnes CO2e)",
    "| Sector | 2019 |",
    "| :--- | ---: |",
    "| Energy | 5 (approx) |",
  ].join("\n");

  it("lists tables, figures, headings, unit lines and header rows", () => {
    expect(captionLines(text)).toEqual([
      "**Table 2: Emissions (kt CO2e)**",
      "Figure 4 Emissions by sector",
      "## Summary",
      "(kt CO2e)",
      "Total GHGs (metric tonnes CO2e)",
      "| Sector | 2019 |",
    ]);
  });

  it("tableCaptionLines leaves out figures and unit lines", () => {
    expect(tableCaptionLines(text)).toEqual([
      "**Table 2: Emissions (kt CO2e)**",
      "## Summary",
      "| Sector | 2019 |",
    ]);
  });
});

describe("yearEvidence", () => {
  it("other year in a table caption", () => {
    expect(
      yearEvidence("Table A-3 GHG emissions for 2019\n1,000 2,000", 2021, 2026),
    ).toMatchObject({ kind: "other", years: [2019] });
  });
  it("target year", () => {
    expect(
      yearEvidence("Table 3-1 Emissions summary for 2021", 2021, 2026).kind,
    ).toBe("target");
  });
  it.each([2021, 2022])("fiscal 2021/22 is target for %i", (year) => {
    expect(yearEvidence("Table 4 Emissions 2021/22", year, 2026).kind).toBe(
      "target",
    );
  });
  it.each(["2020-21", "FY2021", "FY21", "2021-22"])("fiscal %s", (form) => {
    expect(yearEvidence(`Table 4 Emissions ${form}`, 2021, 2026).kind).toBe(
      "target",
    );
  });
  it.each([
    ["FY2021", 2020, "target"],
    ["FY2021", 2021, "target"],
    ["FY21", 2020, "target"],
    ["FY21", 2022, "other"],
  ])("%s with target %i is %s", (form, year, kind) => {
    expect(yearEvidence(`Table 4 Emissions ${form}`, year, 2026).kind).toBe(
      kind,
    );
  });
  it("figure captions are left out", () => {
    expect(yearEvidence("Figure 2 Emissions 2019", 2021, 2026).kind).toBe(
      "none",
    );
  });
  it.each(["2005–2019", "2005-2019", "2005 to 2019"])(
    "range %s is ignored",
    (range) => {
      expect(yearEvidence(`Table 9 Trend ${range}`, 2021, 2026).kind).toBe(
        "none",
      );
    },
  );
  it("projection year is ignored", () => {
    expect(yearEvidence("## Targets to 2050", 2021, 2026).kind).toBe("none");
  });
  it("year after the current year is ignored", () => {
    expect(yearEvidence("Table 5 Outlook 2030", 2021, 2026).kind).toBe("none");
  });
  it("prose is not a caption", () => {
    expect(yearEvidence("In 2019 the council grew.", 2021, 2026).kind).toBe(
      "none",
    );
  });
  // Review Focus 3
  it("markdown header row names the target", () => {
    expect(
      yearEvidence(
        "| Sector | 2019 | 2021 |\n| --- | --- | --- |\n| A | 1 | 2 |",
        2021,
        2026,
      ).kind,
    ).toBe("target");
  });
  it("several other years in order", () => {
    expect(
      yearEvidence("Table 1 Emissions 2018 and 2019", 2021, 2026),
    ).toMatchObject({ kind: "other", years: [2018, 2019] });
  });
});

describe("yearEvidence leadText", () => {
  it("is the text above the first caption naming another year", () => {
    const page =
      "| V.1 | Ganaderia | 49,71 |\n" +
      "| V.2 | Uso del suelo | -14.041,40 |\n" +
      "## Tabla de Resultados Inventario 2021\n" +
      "| I.1.1 | Residencial | 364.749,37 |";
    const ev = yearEvidence(page, 2022, 2026);
    expect(ev.kind).toBe("other");
    expect(ev.leadText).toContain("49,71");
    expect(ev.leadText).not.toContain("364.749,37");
  });
  it("is empty for target and none", () => {
    expect(yearEvidence("Table 3 Emissions 2021", 2021, 2026).leadText).toBe(
      "",
    );
    expect(yearEvidence("| a | 1 |", 2021, 2026).leadText).toBe("");
  });
});

describe("namesLargeUnit", () => {
  it.each([
    "Table 2 Emissions (kt CO2e)",
    "| Sector | ktCO2e |\n| --- | --- |",
    "Table 5 (Mt CO2e)",
    "Table 5 Mt CO2-e",
    "Table 7 thousand tonnes CO2e",
    "Table 8 (Gg)",
    "Table 9 Emissions (million tonnes CO2e)",
    "Table 9 million tons",
  ])("is true for %j", (text) => {
    expect(namesLargeUnit(text)).toBe(true);
  });

  it.each([
    "Total GHGs (metric tonnes CO2e)",
    "Table 3 (t CO2e)",
    "Table 4 (mt CO2e)",
    "about 3 kt of waste",
    "Table 6 Emissions at Mt Eden and Mt Wellington (t CO2e)",
  ])("is false for %j", (text) => {
    expect(namesLargeUnit(text)).toBe(false);
  });
});

describe("yearEvidence: comparison and publication lines", () => {
  it.each([
    "| Sector | tCO2e | Change since 2016 (%) |\n| --- | --- | --- |",
    "## Comparison with the 2016 baseline",
    "# Report published June 2023",
    "Table 6 Emissions compared with 2016",
    "Table 6 Changes from 2018",
    "Table 6 Emissions vs. 2019",
    "Table 6 Base year 2016 emissions",
    "## Revised 2024",
  ])("%j is none for 2021", (text) => {
    expect(yearEvidence(text, 2021, 2026).kind).toBe("none");
  });
  it("a comparison line that names the target is target", () => {
    expect(
      yearEvidence(
        "| Sector | 2021 tCO2e | Change since 2016 (%) |\n| --- | --- | --- |",
        2021,
        2026,
      ),
    ).toMatchObject({ kind: "target", years: [] });
  });
  it("whole words only", () => {
    // "Fromage" and "prepared" inside other words do not count.
    expect(yearEvidence("Table 2 Fromagerie 2019", 2021, 2026).kind).toBe(
      "other",
    );
  });
  it("from before a noun governs no year", () => {
    expect(
      yearEvidence("Table A-3 GHG emissions from transport 2019", 2021, 2026),
    ).toMatchObject({ kind: "other", years: [2019] });
  });
  it("from a range is a range", () => {
    expect(
      yearEvidence("Table 5 Emissions from 2016 to 2019", 2021, 2026).kind,
    ).toBe("none");
  });
  it("the table year before a comparison counts", () => {
    expect(
      yearEvidence("Table 6 2021 emissions compared with 2016", 2021, 2026),
    ).toMatchObject({ kind: "target", years: [] });
  });
  it.each([
    ["Table 6 Change since the 2016 inventory", "none"],
    ["Table 6 Emissions relative to 2018", "none"],
    ["Table 6 Emissions 2019 versus 2016", "other"],
    ["Table 6 Change (%) 2019", "other"],
    ["Table 6 2016 base year, emissions for the 2019 inventory", "other"],
  ])("%j is %s for 2021", (text, kind) => {
    expect(yearEvidence(text, 2021, 2026).kind).toBe(kind);
  });
  it("other-year caption still counts", () => {
    expect(
      yearEvidence("Table A-3 GHG emissions for 2019", 2021, 2026).kind,
    ).toBe("other");
  });
});

describe("namesLargeUnit: table lines over figures", () => {
  it("a kt figure does not void a tonnes table header", () => {
    expect(
      namesLargeUnit(
        "Figure 3: Emissions by sector (kt CO2e)\n| Sector | tCO2e |\n| --- | --- |",
      ),
    ).toBe(false);
  });
  it("a kt figure counts when no table line names tonnes", () => {
    expect(
      namesLargeUnit(
        "Figure 3 (kt CO2e)\n| Sector | Emissions |\n| --- | --- |",
      ),
    ).toBe(true);
  });
  it("a kt unit line does not void a tonnes caption", () => {
    expect(namesLargeUnit("Table 4 Emissions (tonnes CO2e)\n(kt CO2e)")).toBe(
      false,
    );
  });
  it("a kt table header wins over a tonnes caption", () => {
    expect(
      namesLargeUnit(
        "Table 4 Emissions (t CO2e)\n| Sector | kt CO2e |\n| --- | --- |",
      ),
    ).toBe(true);
  });
});

describe("isValueInNumbers", () => {
  it.each<[number, string]>([
    [9559215, "| TOTAL | 9,559,215 |"],
    [9559215, "Total 9,559,215.4"],
    [9559215, "(kt CO2e) Total 9,559.2"],
    [-811512, "Forestry (811,512)"],
    [-603983, "AFOLU −603,983"],
    [5000000, "Total 4,876,120"],
    [9559215, "about 9.56 million"],
    [2000000, "CO2e emissions"],
  ])("agrees with isValueInText for %s in %j", (raw, text) => {
    const numbers = numbersInText(text, detectNumberStyle(text));
    expect(isValueInNumbers(raw, numbers)).toBe(isValueInText(raw, text));
  });
});

describe("parseNumberString with unit, percent or plus sign", () => {
  it.each<[string, NumberStyle, number]>([
    ["1234 tCO2e", "unknown", 1234],
    ["1,234.5 tCO2e", "english", 1234.5],
    ["9.559.215 t CO2e", "european", 9559215],
    ["-603,983 tCO2e", "english", -603983],
    ["+5", "unknown", 5],
    ["12%", "unknown", 12],
    ["12,5 %", "european", 12.5],
    ["1500 kg", "unknown", 1500],
  ])("parses %s (%s) as %s", (input, style, expected) => {
    expect(parseNumberString(input, style)).toBe(expected);
  });

  it.each(["tCO2e", "abc", "t 1234", "1.2.3 t", "+-5", "%"])(
    "still rejects %s",
    (input) => {
      expect(parseNumberString(input, "unknown")).toBeNull();
    },
  );
});

describe("parseNumberString ambiguous group callback", () => {
  it("reports a single 3-digit group read with style unknown", () => {
    const seen: string[] = [];
    expect(parseNumberString("1.500", "unknown", (s) => seen.push(s))).toBe(1.5);
    expect(parseNumberString("1,500", "unknown", (s) => seen.push(s))).toBe(1500);
    expect(seen).toEqual(["1.500", "1,500"]);
  });

  it("does not report when the style is known or the value is not ambiguous", () => {
    const seen: string[] = [];
    parseNumberString("1.500", "european", (s) => seen.push(s));
    parseNumberString("1,500", "english", (s) => seen.push(s));
    parseNumberString("1.5", "unknown", (s) => seen.push(s));
    parseNumberString("1,234,567", "unknown", (s) => seen.push(s));
    expect(seen).toEqual([]);
  });
});
