/** @jest-environment jsdom */
import { afterAll, beforeAll, describe, expect, it, jest } from "@jest/globals";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { ChakraProvider, defaultSystem } from "@chakra-ui/react";
import {
  SourceCheckCards,
  type SourceCheckAnswer,
} from "@/components/steps/GHGI/import/source-check-card";
import {
  hasPendingSourceChecks,
  type SourceChecks,
} from "@/util/GHGI/source-checks";
import type { ExtractedRow } from "@/backend/InventoryExtractionService";
import type {
  ExtractionSummary,
  ReportedTotal,
} from "@/util/GHGI/extraction-summary";
import en from "@/i18n/locales/en/onboarding.json";

const originalStructuredClone = globalThis.structuredClone;
beforeAll(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  // jsdom has no CSS.escape, which the zag radio group calls.
  (globalThis as unknown as { CSS?: { escape: (v: string) => string } }).CSS ??=
    { escape: (v: string) => v };
  globalThis.structuredClone = (value) =>
    value === undefined ? value : JSON.parse(JSON.stringify(value));
});
afterAll(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = false;
  globalThis.structuredClone = originalStructuredClone;
});

const t = ((key: string, opts?: Record<string, unknown>) => {
  const strings = en as Record<string, string>;
  const plural =
    typeof opts?.count === "number"
      ? strings[`${key}_${opts.count === 1 ? "one" : "other"}`]
      : undefined;
  const template = plural ?? strings[key] ?? key;
  return template.replace(/\{\{(\w+)\}\}/g, (_, k) => String(opts?.[k] ?? ""));
}) as never;

const row = (o: Record<string, unknown>) => o as unknown as ExtractedRow;

// Sum 3,250,886 t, every row printed in "MT".
const MT_ROWS = [
  row({ gpcRefNo: "I.1.1", totalCO2e: 252514, unitCheck: "MT" }),
  row({ gpcRefNo: "I.2.1", totalCO2e: 2998372, unitCheck: "MT" }),
];

const UNIT_CHECKS: SourceChecks = {
  unit: {
    status: "pending",
    reading: "t",
    evidence: {
      unitText: "MT",
      sources: ["Table header"],
      pages: [15, 16, 17, 18, 19],
      example: { label: "residential natural gas", text: "252,514" },
    },
  },
};

const candidate = (o: Partial<ReportedTotal>) =>
  ({
    label: "BASIC",
    value: 412300,
    year: 2022,
    scope: null,
    sector: null,
    subsector: null,
    level: "total",
    ...o,
  }) as ReportedTotal;

async function render(props: {
  checks: SourceChecks | undefined;
  rows?: ExtractedRow[];
  population?: number | null;
  onConfirm?: (answer: SourceCheckAnswer) => unknown;
  locale?: string;
}) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  await act(async () =>
    root.render(
      <ChakraProvider value={defaultSystem}>
        <SourceCheckCards
          t={t}
          checks={props.checks}
          rows={props.rows ?? []}
          population={props.population ?? null}
          onConfirm={props.onConfirm ?? (() => {})}
          locale={props.locale ?? "en"}
        />
      </ChakraProvider>,
    ),
  );
  return container;
}

const radio = (c: HTMLElement, value: string) =>
  c.querySelector(`input[type="radio"][value="${value}"]`) as HTMLInputElement;

const button = (c: HTMLElement, text: string) =>
  Array.from(c.querySelectorAll("button")).find(
    (b) => b.textContent?.trim() === text,
  ) as HTMLButtonElement;

const byTestId = (c: HTMLElement, id: string) =>
  c.querySelector(`[data-testid="${id}"]`);

function setInput(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value",
  )!.set!;
  setter.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

describe("SourceCheckCards", () => {
  it("unit card in range", async () => {
    const c = await render({
      checks: UNIT_CHECKS,
      rows: MT_ROWS,
      population: 342000,
    });
    expect(c.textContent).toContain("Check units");
    expect(c.textContent).toContain("AI draft - needs review");
    expect(c.textContent).toContain("3,250,886 t");
    expect(c.textContent).toContain("pp. 15–19");
    expect(byTestId(c, "check-per-person")?.textContent).toContain(
      "9.5 t per person",
    );
    expect(byTestId(c, "check-implausible")).toBeNull();
    expect(c.textContent).toContain(
      'US-style reports often use "MT" for metric tonnes; reading it as megatonnes is a common import error.',
    );
    expect(button(c, "Flag")).toBeUndefined();
    // City scale: tonnes neutral, megatonnes far above.
    expect(c.textContent).toContain(
      "Reads the values as written in metric tonnes.",
    );
    expect(c.textContent).toContain(
      "Total would be far above any city inventory.",
    );
    expect(c.textContent).not.toContain("far below");
  });

  it("unit card for a megatonne document", async () => {
    const c = await render({
      checks: UNIT_CHECKS,
      rows: [
        row({ gpcRefNo: "I.1.1", totalCO2e: 20, unitCheck: "MT" }),
        row({ gpcRefNo: "I.2.1", totalCO2e: 5, unitCheck: "MT" }),
      ],
      population: 5_000_000,
    });
    expect(c.textContent).toContain(
      "Total would be far below what a city inventory shows.",
    );
    expect(c.textContent).toContain(
      "Reads the values as written in megatonnes.",
    );
    expect(c.textContent).not.toContain("far above any city inventory");
    expect(c.textContent).not.toContain("US-style reports");
  });

  it("unit card without population judges the total", async () => {
    const c = await render({ checks: UNIT_CHECKS, rows: MT_ROWS });
    expect(c.textContent).toContain(
      "Total would be far above any city inventory.",
    );
    expect(c.textContent).toContain("US-style reports");
  });

  it("unit card megatonnes warns", async () => {
    const onConfirm = jest.fn();
    const c = await render({
      checks: UNIT_CHECKS,
      rows: MT_ROWS,
      population: 342000,
      onConfirm,
    });
    expect(c.textContent).toContain("3.25 trillion t");
    await act(async () => radio(c, "Mt").click());
    expect(byTestId(c, "check-implausible")?.textContent).toContain(
      "roughly one million times larger",
    );
    expect(byTestId(c, "check-per-person")?.textContent).toContain(
      "9,505,514.6 t per person",
    );
    await act(async () => button(c, "Confirm").click());
    expect(onConfirm).toHaveBeenCalledWith({
      units: { doc: "Mt" },
      expected: { units: { doc: "t" }, numberFormat: null },
    });
  });

  it("no population hides per-person", async () => {
    const c = await render({ checks: UNIT_CHECKS, rows: MT_ROWS });
    expect(c.textContent).not.toContain("per person");
  });

  it("number format card", async () => {
    const c = await render({
      checks: {
        numberFormat: {
          status: "pending",
          reading: "english",
          examples: [{ label: "Stationary energy", text: "6.600" }],
        },
      },
      rows: [
        row({
          totalCO2e: 6.6,
          numberCheck: true,
          totalCO2eText: "6.600",
          printedFactor: 1,
        }),
      ],
    });
    expect(c.textContent).toContain("6.600");
    expect(c.textContent).toContain("Read as 6600");
    expect(c.textContent).toContain("Read as 6.6");
    expect(radio(c, "english").checked).toBe(true);
  });

  it("number format labels have no grouping in any locale", async () => {
    const c = await render({
      checks: {
        numberFormat: {
          status: "pending",
          reading: "english",
          examples: [{ label: "Stationary energy", text: "6.600" }],
        },
      },
      locale: "pt-BR",
    });
    expect(c.textContent).toContain("Read as 6600");
    expect(c.textContent).toContain("Read as 6,6");
    expect(c.textContent).not.toContain("Read as 6.600");
  });

  it("total card printed", async () => {
    const onConfirm = jest.fn();
    const c = await render({
      checks: {
        total: {
          status: "pending",
          candidates: [candidate({ source: "Table 3", page: 7 })],
          selected: null,
          suggested: 0,
        },
      },
      onConfirm,
    });
    expect(c.textContent).toContain("BASIC");
    expect(c.textContent).toContain("412,300 t");
    expect(c.textContent).toContain("Table 3");
    expect(c.textContent).toContain("p. 7");
    await act(async () => button(c, "Confirm").click());
    expect(onConfirm).toHaveBeenCalledWith({
      total: { candidate: 0 },
      expected: { units: {}, numberFormat: null },
    });
  });

  it("total card fallback", async () => {
    const onConfirm = jest.fn();
    const c = await render({
      checks: {
        total: {
          status: "pending",
          candidates: [],
          selected: null,
          suggested: null,
        },
      },
      onConfirm,
    });
    const input = c.querySelector(
      "input[inputmode='decimal']",
    ) as HTMLInputElement | null;
    expect(input).not.toBeNull();
    expect(c.textContent).toContain("No source");
    await act(async () => setInput(input!, "412300"));
    await act(async () => button(c, "Confirm").click());
    expect(onConfirm).toHaveBeenCalledWith({
      total: { value: 412300 },
      expected: { units: {}, numberFormat: null },
    });
    await act(async () => button(c, "Continue without a total").click());
    expect(onConfirm).toHaveBeenCalledWith({
      total: { skip: true },
      expected: { units: {}, numberFormat: null },
    });
  });

  it("reads a typed total in the app language and shows the parsed value", async () => {
    const onConfirm = jest.fn();
    const c = await render({
      checks: {
        total: {
          status: "pending",
          candidates: [],
          selected: null,
          suggested: null,
        },
      },
      onConfirm,
      locale: "de",
    });
    const input = c.querySelector(
      "input[inputmode='decimal']",
    ) as HTMLInputElement;
    await act(async () => setInput(input, "250.000"));
    expect(byTestId(c, "import-total-parsed")?.textContent).toContain(
      (250000).toLocaleString("de"),
    );
    await act(async () => button(c, "Confirm").click());
    expect(onConfirm).toHaveBeenCalledWith({
      total: { value: 250000 },
      expected: { units: {}, numberFormat: null },
    });
  });

  it("reads a typed total in english as english", async () => {
    const onConfirm = jest.fn();
    const c = await render({
      checks: {
        total: {
          status: "pending",
          candidates: [],
          selected: null,
          suggested: null,
        },
      },
      onConfirm,
    });
    const input = c.querySelector(
      "input[inputmode='decimal']",
    ) as HTMLInputElement;
    await act(async () => setInput(input, "250.5"));
    await act(async () => button(c, "Confirm").click());
    expect(onConfirm).toHaveBeenCalledWith({
      total: { value: 250.5 },
      expected: { units: {}, numberFormat: null },
    });
  });

  it("lets the user enter another total when the document prints one", async () => {
    const onConfirm = jest.fn();
    const c = await render({
      checks: {
        total: {
          status: "pending",
          candidates: [candidate({ source: "Table 3", page: 7 })],
          selected: null,
          suggested: 0,
        },
      },
      onConfirm,
    });
    expect(radio(c, "0").checked).toBe(true);
    expect(c.querySelector("input[inputmode='decimal']")).toBeNull();
    expect(c.textContent).toContain("Enter another total");
    await act(async () => radio(c, "other").click());
    const input = c.querySelector(
      "input[inputmode='decimal']",
    ) as HTMLInputElement;
    expect(input).not.toBeNull();
    expect(c.textContent).toContain("No source");
    expect(button(c, "Confirm").disabled).toBe(true);
    await act(async () => setInput(input, "400,000"));
    expect(byTestId(c, "import-total-parsed")?.textContent).toContain(
      "400,000",
    );
    expect(button(c, "Confirm").disabled).toBe(false);
    await act(async () => button(c, "Confirm").click());
    expect(onConfirm).toHaveBeenCalledWith({
      total: { value: 400000 },
      expected: { units: {}, numberFormat: null },
    });
    // No "Continue without" when the document prints a total.
    expect(button(c, "Continue without a total")).toBeUndefined();
  });

  it("reopens a typed total with the other option and its value", async () => {
    const c = await render({
      checks: {
        total: {
          status: "pending",
          candidates: [candidate({})],
          selected: { value: 400000, origin: "user" } as never,
          suggested: 0,
        },
      },
    });
    expect(radio(c, "other").checked).toBe(true);
    expect(
      (c.querySelector("input[inputmode='decimal']") as HTMLInputElement).value,
    ).toBe("400000");
  });

  it("preselects no total when none qualifies, and waits for a pick", async () => {
    const onConfirm = jest.fn();
    const c = await render({
      checks: {
        total: {
          status: "pending",
          candidates: [
            candidate({ label: "Net emissions", value: 300000 }),
            candidate({ label: "Net total incl. forestry", value: 280000 }),
          ],
          selected: null,
          suggested: null,
        },
      },
      onConfirm,
    });
    expect(radio(c, "0").checked).toBe(false);
    expect(radio(c, "1").checked).toBe(false);
    expect(button(c, "Confirm").disabled).toBe(true);
    await act(async () => radio(c, "1").click());
    expect(button(c, "Confirm").disabled).toBe(false);
    await act(async () => button(c, "Confirm").click());
    expect(onConfirm).toHaveBeenCalledWith({
      total: { candidate: 1 },
      expected: { units: {}, numberFormat: null },
    });
  });

  it("a single total that does not qualify is offered, not preselected", async () => {
    const c = await render({
      checks: {
        total: {
          status: "pending",
          candidates: [candidate({ label: "Net emissions", value: 300000 })],
          selected: null,
          suggested: null,
        },
      },
    });
    expect(radio(c, "0").checked).toBe(false);
    expect(button(c, "Confirm").disabled).toBe(true);
  });

  it("sends the readings the totals were computed under", async () => {
    const onConfirm = jest.fn();
    const c = await render({
      checks: {
        unit: { ...UNIT_CHECKS.unit!, status: "confirmed", reading: "Mt" },
        numberFormat: {
          status: "pending",
          reading: "european",
          examples: [{ label: "Stationary energy", text: "6.600" }],
        },
      },
      rows: MT_ROWS,
      onConfirm,
    });
    await act(async () => button(c, "Confirm").click());
    expect(onConfirm).toHaveBeenCalledWith({
      numberFormat: "european",
      expected: { units: { doc: "Mt" }, numberFormat: "european" },
    });
  });

  describe("number format gas note", () => {
    const GAS_NOTE = "the gas breakdown (CO2, CH4, N2O) is dropped";
    const numberChecks = (reading: "english" | "european"): SourceChecks => ({
      numberFormat: {
        status: "pending",
        reading,
        examples: [{ label: "Stationary energy", text: "6.600" }],
      },
    });
    const gasRow = (extra: Record<string, unknown> = {}) =>
      row({
        gpcRefNo: "I.1.1",
        totalCO2e: 6600,
        totalCO2eText: "6.600",
        numberCheck: true,
        co2: 6000,
        ch4: 400,
        n2o: 200,
        ...extra,
      });
    const extracted = {
      co2: 6000,
      ch4: 400,
      n2o: 200,
      numberFormat: "european",
      unit: "t",
    };

    it("shows the note when moving away from the extraction reading", async () => {
      const c = await render({
        checks: numberChecks("european"),
        rows: [gasRow({ extractedGases: extracted })],
      });
      expect(c.textContent).not.toContain(GAS_NOTE);
      await act(async () => radio(c, "english").click());
      expect(c.textContent).toContain(GAS_NOTE);
    });

    it("hides the note when returning to the extraction reading", async () => {
      const c = await render({
        checks: numberChecks("english"),
        rows: [gasRow({ extractedGases: extracted })],
      });
      await act(async () => radio(c, "european").click());
      expect(c.textContent).not.toContain(GAS_NOTE);
    });

    it("hides the note when no row has gases", async () => {
      const c = await render({
        checks: numberChecks("european"),
        rows: [gasRow({ co2: null, ch4: null, n2o: null })],
      });
      await act(async () => radio(c, "english").click());
      expect(c.textContent).not.toContain(GAS_NOTE);
    });
  });

  it("disables every Confirm while a save is in flight", async () => {
    let resolve: (saved: boolean) => void = () => {};
    const onConfirm = jest.fn(
      () =>
        new Promise<boolean>((done) => {
          resolve = done;
        }),
    );
    const c = await render({
      checks: {
        ...UNIT_CHECKS,
        total: {
          status: "pending",
          candidates: [candidate({})],
          selected: null,
          suggested: 0,
        },
      },
      rows: MT_ROWS,
      onConfirm,
    });
    const [unitConfirm, totalConfirm] = Array.from(
      c.querySelectorAll("button"),
    ).filter((b) => b.textContent?.trim() === "Confirm");
    await act(async () => unitConfirm.click());
    expect(totalConfirm.disabled).toBe(true);
    await act(async () => totalConfirm.click());
    expect(onConfirm).toHaveBeenCalledTimes(1);
    await act(async () => resolve(true));
    expect(totalConfirm.disabled).toBe(false);
  });

  it("Continue without a total saves once on a double click", async () => {
    let resolve: (saved: boolean) => void = () => {};
    const onConfirm = jest.fn(
      () =>
        new Promise<boolean>((done) => {
          resolve = done;
        }),
    );
    const c = await render({
      checks: {
        total: {
          status: "pending",
          candidates: [],
          selected: null,
          suggested: null,
        },
      },
      onConfirm,
    });
    const skip = button(c, "Continue without a total");
    await act(async () => {
      skip.click();
      skip.click();
    });
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(skip.disabled).toBe(true);
    await act(async () => resolve(true));
    expect(skip.disabled).toBe(false);
  });

  it("a confirmed typed total keeps the No source mark", async () => {
    const typed = await render({
      checks: {
        total: {
          status: "confirmed",
          candidates: [],
          selected: { value: 412300, origin: "user" },
          suggested: null,
        },
      },
    });
    expect(typed.textContent).toContain("Total: 412,300 t — confirmed");
    expect(typed.textContent).toContain("No source");

    const printed = await render({
      checks: {
        total: {
          status: "confirmed",
          candidates: [candidate({})],
          selected: { value: 412300, origin: "document", label: "BASIC" },
          suggested: 0,
        },
      },
    });
    expect(printed.textContent).toContain("Total: 412,300 t — confirmed");
    expect(printed.textContent).not.toContain("No source");
  });

  it("confirmed check collapses and reopens", async () => {
    const c = await render({
      checks: { unit: { ...UNIT_CHECKS.unit!, status: "confirmed" } },
      rows: MT_ROWS,
    });
    expect(c.textContent).toContain("Units: metric tonnes — confirmed");
    expect(radio(c, "Mt")).toBeNull();
    await act(async () => button(c, "Change").click());
    expect(radio(c, "Mt")).not.toBeNull();
  });

  it("a failed save from Change keeps the card open", async () => {
    const onConfirm = jest.fn(async (): Promise<boolean> => false);
    const c = await render({
      checks: { unit: { ...UNIT_CHECKS.unit!, status: "confirmed" } },
      rows: MT_ROWS,
      onConfirm,
    });
    await act(async () => button(c, "Change").click());
    await act(async () => button(c, "Confirm").click());
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(radio(c, "Mt")).not.toBeNull();

    // A thrown error keeps it open too; a saved answer closes it.
    onConfirm.mockImplementationOnce(async () => {
      throw new Error("network");
    });
    await act(async () => button(c, "Confirm").click());
    expect(radio(c, "Mt")).not.toBeNull();
    onConfirm.mockImplementationOnce(async () => true);
    await act(async () => button(c, "Confirm").click());
    expect(radio(c, "Mt")).toBeNull();
    expect(c.textContent).toContain("Units: metric tonnes — confirmed");
  });

  it("no checks no cards", async () => {
    const c = await render({ checks: undefined });
    expect(c.textContent).toBe("");
  });
});

describe("unit group card (rows without a printed unit)", () => {
  // p12: 6.75 t as stored; p14: 10 t; plus 100 t printed with a unit.
  const GROUP_ROWS = [
    row({ gpcRefNo: "I.1.1", totalCO2e: 1.5, unitCheck: "missing", page: 12 }),
    row({ gpcRefNo: "I.2.1", totalCO2e: 2, unitCheck: "missing", page: 12 }),
    row({ gpcRefNo: "I.3.1", totalCO2e: 3.25, unitCheck: "missing", page: 12 }),
    row({ gpcRefNo: "II.1.1", totalCO2e: 10, unitCheck: "missing", page: 14 }),
    row({ gpcRefNo: "II.2.1", totalCO2e: 100, page: 12 }),
  ];
  const group = (
    key: string,
    page: number,
    rowCount: number,
    extra: Record<string, unknown> = {},
  ) => ({
    key,
    page,
    tableId: null,
    rowCount,
    preselected: "t" as const,
    options: ["t" as const, "kt" as const, "Mt" as const],
    status: "pending" as const,
    reading: null,
    ...extra,
  });
  const GROUP_CHECKS: SourceChecks = {
    unitGroups: [
      group("p12", 12, 3, { preselected: "kt" }),
      group("p14", 14, 1),
    ],
  };
  const groupEl = (c: HTMLElement, key: string) =>
    byTestId(c, `unit-group-${key}`) as HTMLElement;

  it("renders one radio group per unit group, kt preselected on a kt-only page", async () => {
    const c = await render({ checks: GROUP_CHECKS, rows: GROUP_ROWS });
    expect(c.textContent).toContain("Page 12: 3 rows without a printed unit");
    expect(c.textContent).toContain("Page 14: 1 row without a printed unit");
    expect(c.querySelectorAll("[role=radiogroup]")).toHaveLength(2);
    expect(radio(groupEl(c, "p12"), "kt").checked).toBe(true);
    expect(radio(groupEl(c, "p14"), "t").checked).toBe(true);
    expect(groupEl(c, "p12").textContent).toContain(
      "Kilotonnes of CO₂e (thousand t)",
    );
  });

  it("each option shows its total and t per person", async () => {
    const c = await render({
      checks: GROUP_CHECKS,
      rows: GROUP_ROWS,
      population: 1000,
    });
    const p12 = groupEl(c, "p12").textContent;
    // t: 6.75 + 10 + 100; kt: 6,750 + 110; Mt: 6,750,000 + 110.
    expect(p12).toContain("117 t");
    expect(p12).toContain("0.1 t per person");
    expect(p12).toContain("6,860 t");
    expect(p12).toContain("6.9 t per person");
    expect(p12).toContain("6,750,110 t");
    expect(p12).toContain("6,750.1 t per person");
    // Another group's options use this group's current selection (kt).
    expect(groupEl(c, "p14").textContent).toContain("16,850 t");
    expect(byTestId(c, "check-per-person")?.textContent).toContain(
      "6.9 t per person",
    );
    expect(byTestId(c, "check-implausible")).toBeNull();
    await act(async () => radio(groupEl(c, "p12"), "Mt").click());
    expect(byTestId(c, "check-implausible")).not.toBeNull();
  });

  it("Confirm sends units for every group, without unanswered groups in expected", async () => {
    const onConfirm = jest.fn();
    const c = await render({
      checks: GROUP_CHECKS,
      rows: GROUP_ROWS,
      onConfirm,
    });
    await act(async () => radio(groupEl(c, "p14"), "kt").click());
    await act(async () => button(c, "Confirm").click());
    expect(onConfirm).toHaveBeenCalledWith({
      units: { p12: "kt", p14: "kt" },
      expected: { units: {}, numberFormat: null },
    });
  });

  it("an answered group starts from its reading and is in expected", async () => {
    const onConfirm = jest.fn();
    const c = await render({
      checks: {
        unitGroups: [
          group("p12", 12, 3, {
            preselected: "kt",
            status: "confirmed",
            reading: "Mt",
          }),
          group("p14", 14, 1),
        ],
      },
      rows: GROUP_ROWS,
      onConfirm,
    });
    expect(radio(groupEl(c, "p12"), "Mt").checked).toBe(true);
    await act(async () => button(c, "Confirm").click());
    expect(onConfirm).toHaveBeenCalledWith({
      units: { p12: "Mt", p14: "t" },
      expected: { units: { p12: "Mt" }, numberFormat: null },
    });
  });

  it("shows one confirmed line once every group is answered", async () => {
    const c = await render({
      checks: {
        unitGroups: [
          group("p12", 12, 3, { status: "confirmed", reading: "kt" }),
          group("p14", 14, 1, { status: "confirmed", reading: "t" }),
        ],
      },
      rows: GROUP_ROWS,
    });
    expect(c.textContent).toContain(
      "Units: p. 12 in kilotonnes, p. 14 in metric tonnes — confirmed",
    );
    expect(c.querySelectorAll("[role=radiogroup]")).toHaveLength(0);
  });

  it("numbers the tables of one page in the heading and the confirmed line", async () => {
    const tableRows = [
      row({ totalCO2e: 1, unitCheck: "missing", page: 2 }),
      row({ totalCO2e: 2, unitCheck: "missing", page: 2 }),
      row({ totalCO2e: 3, unitCheck: "missing", page: 2 }),
      row({ totalCO2e: 4, unitCheck: "missing", page: 5 }),
    ];
    const pending = await render({
      checks: {
        unitGroups: [
          group("p2:t1", 2, 1, { tableId: "t1" }),
          group("p2:t2", 2, 2, { tableId: "t2" }),
          group("p5", 5, 1),
        ],
      },
      rows: tableRows,
    });
    expect(groupEl(pending, "p2:t1").textContent).toContain(
      "Page 2, table 1: 1 row without a printed unit",
    );
    expect(groupEl(pending, "p2:t2").textContent).toContain(
      "Page 2, table 2: 2 rows without a printed unit",
    );
    // A page with one group keeps the page heading.
    expect(groupEl(pending, "p5").textContent).toContain(
      "Page 5: 1 row without a printed unit",
    );
    const confirmed = await render({
      checks: {
        unitGroups: [
          group("p2:t1", 2, 1, {
            tableId: "t1",
            status: "confirmed",
            reading: "kt",
          }),
          group("p2:t2", 2, 2, {
            tableId: "t2",
            status: "confirmed",
            reading: "t",
          }),
        ],
      },
      rows: tableRows.slice(0, 3),
    });
    expect(confirmed.textContent).toContain(
      "Units: p. 2, table 1 in kilotonnes, p. 2, table 2 in metric tonnes — confirmed",
    );
  });

  it("numbers only the table groups of a page, in table order", async () => {
    const c = await render({
      checks: {
        unitGroups: [
          group("p2", 2, 1),
          group("p2:tbl-10.md", 2, 1, { tableId: "tbl-10.md" }),
          group("p2:tbl-2.md", 2, 1, { tableId: "tbl-2.md" }),
        ],
      },
      rows: [
        row({ totalCO2e: 1, unitCheck: "missing", page: 2 }),
        row({ totalCO2e: 2, unitCheck: "missing", page: 2 }),
        row({ totalCO2e: 3, unitCheck: "missing", page: 2 }),
      ],
    });
    expect(groupEl(c, "p2:tbl-2.md").textContent).toContain(
      "Page 2, table 1: 1 row without a printed unit",
    );
    expect(groupEl(c, "p2:tbl-10.md").textContent).toContain(
      "Page 2, table 2: 1 row without a printed unit",
    );
    expect(groupEl(c, "p2").textContent).toContain(
      "Page 2: 1 row without a printed unit",
    );
  });

  it("notes kg only on a group whose page names kg only", async () => {
    const note =
      "This page names kg. If these rows are in kg, skip them in the review below.";
    const c = await render({
      checks: {
        unitGroups: [group("p5", 5, 1, { kgOnly: true }), group("p14", 14, 1)],
      },
      rows: [
        row({ totalCO2e: 1234, unitCheck: "missing", page: 5 }),
        row({ totalCO2e: 10, unitCheck: "missing", page: 14 }),
      ],
    });
    expect(groupEl(c, "p5").textContent).toContain(note);
    expect(groupEl(c, "p14").textContent).not.toContain(note);
  });

  it("is pending until every group is answered", () => {
    const summary = (sourceChecks: SourceChecks) =>
      ({ sourceChecks }) as unknown as ExtractionSummary;
    expect(hasPendingSourceChecks(summary(GROUP_CHECKS))).toBe(true);
    // One group answered, one pending: still pending.
    expect(
      hasPendingSourceChecks(
        summary({
          unitGroups: [
            group("p12", 12, 3, { status: "confirmed", reading: "kt" }),
            group("p14", 14, 1),
          ],
        }),
      ),
    ).toBe(true);
    expect(
      hasPendingSourceChecks(
        summary({
          unitGroups: [
            group("p12", 12, 3, { status: "confirmed", reading: "kt" }),
          ],
        }),
      ),
    ).toBe(false);
  });
});

describe("hasPendingSourceChecks", () => {
  const summary = (sourceChecks?: SourceChecks) =>
    ({ sourceChecks }) as unknown as ExtractionSummary;

  it("is true with any pending check", () => {
    expect(hasPendingSourceChecks(summary(UNIT_CHECKS))).toBe(true);
    expect(
      hasPendingSourceChecks(
        summary({
          unit: { ...UNIT_CHECKS.unit!, status: "confirmed" },
          total: {
            status: "pending",
            candidates: [],
            selected: null,
            suggested: null,
          },
        }),
      ),
    ).toBe(true);
  });

  it("is false when all are confirmed or checks are missing", () => {
    expect(
      hasPendingSourceChecks(
        summary({ unit: { ...UNIT_CHECKS.unit!, status: "confirmed" } }),
      ),
    ).toBe(false);
    expect(hasPendingSourceChecks(summary(undefined))).toBe(false);
    expect(hasPendingSourceChecks(null)).toBe(false);
  });
});
