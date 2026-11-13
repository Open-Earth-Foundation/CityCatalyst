import {
  applyReadings,
  inPerPersonRange,
  optionTotals,
  perPerson,
  selectLevelTotal,
  type Readings,
} from "@/util/GHGI/source-checks";
import { isAmbiguousNumberText } from "@/util/GHGI/source-text";
import type { ExtractedRow } from "@/backend/InventoryExtractionService";
import type { ReportedTotal } from "@/util/GHGI/extraction-summary";

const T_EN: Readings = { unit: "t", numberFormat: "english" };
const MT_EN: Readings = { unit: "Mt", numberFormat: "english" };
const T_EU: Readings = { unit: "t", numberFormat: "european" };

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

  it("does not restore gases after a separator round trip", () => {
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
      { unit: "Mt", numberFormat: "european" },
    );
    expect(r.totalCO2e).toBe(6600 * 1_000_000);
  });

  it("leaves rows without flags alone", () => {
    const rows = [{ totalCO2e: 5, co2: 2 }];
    const out = applyReadings(rows, T_EN, {
      unit: "Mt",
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
    expect(optionTotals(rows, T_EN, "unit")).toEqual([
      { reading: "t", total: 3250886 },
      { reading: "Mt", total: 3250886e6 },
    ]);
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
});

describe("isAmbiguousNumberText", () => {
  it.each(["6.600", "1,500", "-2,345 tCO2e"])("true for %s", (t) =>
    expect(isAmbiguousNumberText(t)).toBe(true),
  );
  it.each(["1.234.567", "1,5", "1.234,5", "6600"])("false for %s", (t) =>
    expect(isAmbiguousNumberText(t)).toBe(false),
  );
});
