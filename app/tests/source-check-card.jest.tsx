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
  const template = (en as Record<string, string>)[key] ?? key;
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
      unit: "Mt",
      expected: { unit: "t", numberFormat: null },
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
      expected: { unit: null, numberFormat: null },
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
      expected: { unit: null, numberFormat: null },
    });
    await act(async () => button(c, "Continue without a total").click());
    expect(onConfirm).toHaveBeenCalledWith({
      total: { skip: true },
      expected: { unit: null, numberFormat: null },
    });
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
      expected: { unit: "Mt", numberFormat: "european" },
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
