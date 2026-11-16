import {
  applyReadings,
  inPerPersonRange,
  hasPendingSourceChecks,
  optionTotals,
  perPerson,
  readingsOf,
  selectLevelTotal,
  sumImported,
  totalPlausibility,
  type Readings,
  type SourceChecks,
} from "@/util/GHGI/source-checks";
import { isAmbiguousNumberText } from "@/util/GHGI/source-text";
import type { ExtractedRow } from "@/backend/InventoryExtractionService";
import type { ReportedTotal } from "@/util/GHGI/extraction-summary";

const T_EN: Readings = { units: { doc: "t" }, numberFormat: "english" };
const MT_EN: Readings = { units: { doc: "Mt" }, numberFormat: "english" };
const T_EU: Readings = { units: { doc: "t" }, numberFormat: "european" };

const row = (o: Record<string, unknown>) => o as unknown as ExtractedRow;
const total = (label: string, value: number) =>
  ({ label, value }) as unknown as ReportedTotal;

describe("applyReadings", () => {
  it("scales an MT row t to Mt", () => {
    const [r] = applyReadings(
      [{ totalCO2e: 252514, unitCheck: "MT" as const, co2: 100 }],
      T_EN,
      MT_EN,
    );
    expect(r.totalCO2e).toBe(252514000000);
    expect(r.co2).toBe(100000000);
  });

  it("round-trips readings", () => {
    const rows = [
      { totalCO2e: 252514, unitCheck: "MT" as const, co2: 100 },
      {
        totalCO2e: 6600,
        numberCheck: true,
        totalCO2eText: "6.600",
        printedFactor: 1000,
      },
    ];
    expect(
      applyReadings(applyReadings(rows, T_EN, MT_EN), MT_EN, T_EN),
    ).toEqual(rows);
    const eu = applyReadings(rows, T_EN, T_EU);
    expect(eu[1].totalCO2e).toBe(6_600_000);
    expect(applyReadings(eu, T_EU, T_EN)).toEqual(rows);
  });

  it("round-trips decimal values exactly", () => {
    const rows = [
      { totalCO2e: 50947.15, unitCheck: "MT" as const, co2: 15348.78 },
      { totalCO2e: 15348.78, unitCheck: "MT" as const, co2: 50947.15 },
    ];
    expect(
      applyReadings(applyReadings(rows, T_EN, MT_EN), MT_EN, T_EN),
    ).toEqual(rows);
  });

  it("restores the extracted gases after a separator round trip", () => {
    const rows = [
      {
        totalCO2e: 6.6,
        totalCO2eText: "6.600",
        printedFactor: 1,
        numberCheck: true,
        co2: 3,
        ch4: 3.6,
        extractedGases: {
          co2: 3,
          ch4: 3.6,
          numberFormat: "english" as const,
          unit: "t" as const,
        },
      },
    ];
    const eu = applyReadings(rows, T_EN, T_EU);
    expect(eu[0]).toMatchObject({ totalCO2e: 6600, co2: null, ch4: null });
    const back = applyReadings(eu, T_EU, T_EN);
    expect(back).toEqual(rows);
  });

  it("restores gases scaled to the current unit after unit and separator changes", () => {
    const rows = [
      {
        totalCO2e: 6.6,
        totalCO2eText: "6.600",
        printedFactor: 1,
        numberCheck: true,
        unitCheck: "MT" as const,
        co2: 3.3,
        n2o: 3.3,
        extractedGases: {
          co2: 3.3,
          n2o: 3.3,
          numberFormat: "english" as const,
          unit: "t" as const,
        },
      },
    ];
    const MT_EU: Readings = { units: { doc: "Mt" }, numberFormat: "european" };
    // Separator first, then unit; then the separator back under Mt.
    const eu = applyReadings(rows, T_EN, T_EU);
    const mtEu = applyReadings(eu, T_EU, MT_EU);
    expect(mtEu[0]).toMatchObject({ totalCO2e: 6600e6, co2: null });
    const mtEn = applyReadings(mtEu, MT_EU, MT_EN);
    expect(mtEn).toEqual(applyReadings(rows, T_EN, MT_EN));
    expect(mtEn[0]).toMatchObject({ co2: 3.3e6, n2o: 3.3e6 });
    // Both back at once: the stored rows exactly.
    expect(applyReadings(mtEu, MT_EU, T_EN)).toEqual(rows);
  });

  it("does not restore gases without extracted gases", () => {
    const rows = [
      {
        totalCO2e: 6.6,
        totalCO2eText: "6.600",
        printedFactor: 1,
        numberCheck: true,
        co2: 3,
      },
    ];
    const back = applyReadings(applyReadings(rows, T_EN, T_EU), T_EU, T_EN);
    expect(back[0].totalCO2e).toBe(6.6);
    expect(back[0].co2).toBeNull();
  });

  it("re-reads the separator from text", () => {
    const [r] = applyReadings(
      [
        {
          totalCO2e: 6.6,
          totalCO2eText: "6.600",
          printedFactor: 1,
          numberCheck: true,
          co2: 3,
        },
      ],
      T_EN,
      T_EU,
    );
    expect(r.totalCO2e).toBe(6600);
    expect(r.co2).toBeNull();
  });

  it("applies combined readings", () => {
    const [r] = applyReadings(
      [
        {
          totalCO2e: 6.6,
          totalCO2eText: "6.600",
          printedFactor: 1,
          numberCheck: true,
          unitCheck: "MT" as const,
        },
      ],
      T_EN,
      { units: { doc: "Mt" }, numberFormat: "european" },
    );
    expect(r.totalCO2e).toBe(6600 * 1_000_000);
  });

  it("leaves rows without flags alone", () => {
    const rows = [{ totalCO2e: 5, co2: 2 }];
    const out = applyReadings(rows, T_EN, {
      units: { doc: "Mt" },
      numberFormat: "european",
    });
    expect(out).toEqual(rows);
  });

  it("converts reported totals by value", () => {
    const [r] = applyReadings(
      [{ value: 10, unitCheck: "MT" as const }],
      T_EN,
      MT_EN,
    );
    expect(r.value).toBe(10_000_000);
  });
});

describe("optionTotals", () => {
  it("sums each unit reading and skips omitted references", () => {
    const rows = [
      row({ totalCO2e: 3000000, unitCheck: "MT" }),
      row({ totalCO2e: 250886, unitCheck: "MT" }),
      row({ totalCO2e: 999, gpcRefNo: "I.4.4", unitCheck: "MT" }),
    ];
    expect(optionTotals(rows, T_EN, { unitGroup: "doc" })).toEqual([
      { reading: "t", total: 3250886 },
      { reading: "Mt", total: 3250886e6 },
    ]);
  });
});

describe("unit groups", () => {
  // 3 unit-less rows on page 12 (kt only), 1 on page 14 (mixed), 1 in tonnes.
  const groupRows = [
    row({ totalCO2e: 1.5, unitCheck: "missing", page: 12, co2: 1 }),
    row({ totalCO2e: 2, unitCheck: "missing", page: 12 }),
    row({ totalCO2e: 3.25, unitCheck: "missing", page: 12 }),
    row({ totalCO2e: 10, unitCheck: "missing", page: 14 }),
    row({ totalCO2e: 100, page: 12 }),
  ];
  const current: Readings = {
    units: { p12: "t", p14: "t" },
    numberFormat: null,
  };

  it("option totals equal sumImported(applyReadings(...)) for each kt group option", () => {
    const options = optionTotals(groupRows, current, { unitGroup: "p12" });
    expect(options.map((o) => o.reading)).toEqual(["t", "kt", "Mt"]);
    for (const option of options) {
      const to: Readings = {
        ...current,
        units: { ...current.units, p12: option.reading as "t" | "kt" | "Mt" },
      };
      expect(option.total).toBe(
        sumImported(applyReadings(groupRows, current, to)),
      );
    }
    expect(options[1].total).toBe(6750 + 10 + 100);
  });

  it("converts only the rows of the answered group, gases included", () => {
    const kt = applyReadings(groupRows, current, {
      ...current,
      units: { p12: "kt", p14: "t" },
    });
    expect(kt.map((r) => r.totalCO2e)).toEqual([1500, 2000, 3250, 10, 100]);
    expect(kt[0].co2).toBe(1000);
    // Back to tonnes is exact.
    expect(
      applyReadings(
        kt,
        { ...current, units: { p12: "kt", p14: "t" } },
        current,
      ),
    ).toEqual(groupRows);
    // kt to Mt from a converted state.
    const mt = applyReadings(
      kt,
      { ...current, units: { p12: "kt", p14: "t" } },
      { ...current, units: { p12: "Mt", p14: "t" } },
    );
    expect(mt[0].totalCO2e).toBe(1_500_000);
  });

  it("leaves MT rows to the doc reading and unit-less rows to their page", () => {
    const rows = [
      row({ totalCO2e: 2, unitCheck: "MT", page: 12 }),
      row({ totalCO2e: 3, unitCheck: "missing", page: 12 }),
    ];
    const from: Readings = {
      units: { doc: "t", p12: "t" },
      numberFormat: null,
    };
    const out = applyReadings(rows, from, {
      ...from,
      units: { doc: "Mt", p12: "t" },
    });
    expect(out.map((r) => r.totalCO2e)).toEqual([2_000_000, 3]);
  });

  it("an old summary with a single unit reading still converts", () => {
    // Stored before unit groups: only `sourceChecks.unit`, no `unitGroups`.
    const legacy = {
      unit: {
        status: "confirmed",
        reading: "Mt",
        evidence: { unitText: "MT", sources: [], pages: [], example: null },
      },
    } as SourceChecks;
    const from = readingsOf(legacy);
    expect(from).toEqual({ units: { doc: "Mt" }, numberFormat: null });
    const rows = [row({ totalCO2e: 2_000_000, unitCheck: "MT" })];
    const [back] = applyReadings(rows, from, {
      ...from,
      units: { doc: "t" },
    });
    expect(back.totalCO2e).toBe(2);
    expect(hasPendingSourceChecks({ sourceChecks: legacy })).toBe(false);
  });

  it("reads each group's reading and blocks approval while a group is pending", () => {
    const checks = {
      unitGroups: [
        {
          key: "p12",
          page: 12,
          tableId: null,
          rowCount: 3,
          preselected: "kt",
          options: ["t", "kt", "Mt"],
          status: "pending",
          reading: "t",
        },
      ],
    } as SourceChecks;
    expect(readingsOf(checks)).toEqual({
      units: { p12: "t" },
      numberFormat: null,
    });
    expect(hasPendingSourceChecks({ sourceChecks: checks })).toBe(true);
    checks.unitGroups![0].status = "confirmed";
    expect(hasPendingSourceChecks({ sourceChecks: checks })).toBe(false);
  });
});

describe("per person", () => {
  it("divides and guards", () => {
    expect(perPerson(3250886, 342000)).toBeCloseTo(9.505, 2);
    expect(perPerson(5, null)).toBeNull();
    expect(perPerson(5, 0)).toBeNull();
  });
  it("range is inclusive", () => {
    expect(inPerPersonRange(1)).toBe(true);
    expect(inPerPersonRange(20)).toBe(true);
    expect(inPerPersonRange(0.99)).toBe(false);
    expect(inPerPersonRange(20.01)).toBe(false);
  });
});

describe("selectLevelTotal", () => {
  it("skips the net total", () => {
    const c = [
      total("Total Gross Emissions", 785873),
      total("Total Net Emissions (including Forestry)", -25639),
    ];
    expect(selectLevelTotal(c, "gpc_basic")).toBe(0);
  });
  it("skips a positive net total larger than gross", () => {
    const c = [
      total("Total Gross Emissions", 785873),
      total("Total Net Emissions", 900000),
    ];
    expect(selectLevelTotal(c, null)).toBe(0);
  });
  it("prefers the level label", () => {
    const c = [
      total("BASIC 412300", 412300),
      total("BASIC+ 498000", 498000),
      total("BASIC+ S3 610000", 610000),
    ];
    expect(selectLevelTotal(c, "gpc_basic")).toBe(0);
    expect(selectLevelTotal(c, "gpc_basic_plus")).toBe(1);
  });
  it("returns null for no candidates", () => {
    expect(selectLevelTotal([], "gpc_basic")).toBeNull();
  });
  it("skips a labelled total that is net or not positive", () => {
    const c = [
      total("BASIC net emissions", 300000),
      total("BASIC", 0),
      total("Total gross", 785873),
    ];
    expect(selectLevelTotal(c, "gpc_basic")).toBe(2);
    expect(
      selectLevelTotal(
        [total("BASIC net", 1), total("BASIC gross", 9)],
        "gpc_basic",
      ),
    ).toBe(1);
  });
});

describe("totalPlausibility", () => {
  it("uses emissions per person with a population", () => {
    expect(totalPlausibility(3250886, 342000)).toBe("plausible");
    expect(totalPlausibility(3250886e6, 342000)).toBe("high");
    expect(totalPlausibility(25, 5_000_000)).toBe("low");
    expect(totalPlausibility(25e6, 5_000_000)).toBe("plausible");
  });
  it("uses the total without a population", () => {
    expect(totalPlausibility(3250886, null)).toBe("plausible");
    expect(totalPlausibility(2e9, null)).toBe("high");
    expect(totalPlausibility(25, null)).toBe("low");
  });
});

describe("isAmbiguousNumberText", () => {
  it.each(["6.600", "1,500", "-2,345 tCO2e", "(6.600)"])("true for %s", (t) =>
    expect(isAmbiguousNumberText(t)).toBe(true),
  );
  it.each(["1.234.567", "1,5", "1.234,5", "6600"])("false for %s", (t) =>
    expect(isAmbiguousNumberText(t)).toBe(false),
  );
});
