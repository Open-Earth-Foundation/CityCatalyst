/** @jest-environment jsdom */

import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  expect,
  it,
} from "@jest/globals";
import { ChakraProvider, defaultSystem } from "@chakra-ui/react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { TFunction } from "i18next";
import type { ImportScopeNoteRow } from "@/util/types";
import en from "@/i18n/locales/en/onboarding.json";

// Resolves real English strings so the tests assert what the user reads.
const strings = en as Record<string, string>;
const t = Object.assign(
  (key: string, values?: Record<string, unknown>) => {
    const count = values?.count as number | undefined;
    const plural =
      count === undefined ? undefined : count === 1 ? "_one" : "_other";
    const template = strings[key + (plural ?? "")] ?? strings[key] ?? key;
    return template.replace(/\{\{(\w+)\}\}/g, (_, name) =>
      String(values?.[name] ?? ""),
    );
  },
  { lng: "en" },
) as unknown as TFunction;

let ImportScopeNotes: typeof import("@/components/steps/GHGI/import/import-scope-notes").default;
let root: Root;
let container: HTMLDivElement;
const originalStructuredClone = globalThis.structuredClone;

beforeAll(async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  globalThis.structuredClone = (value) =>
    value === undefined ? value : JSON.parse(JSON.stringify(value));
  ({ default: ImportScopeNotes } =
    await import("@/components/steps/GHGI/import/import-scope-notes"));
});
afterAll(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = false;
  globalThis.structuredClone = originalStructuredClone;
});
beforeEach(() => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function render(
  warnings: ImportScopeNoteRow[],
  inferred: ImportScopeNoteRow[],
) {
  act(() => {
    root.render(
      <ChakraProvider value={defaultSystem}>
        <ImportScopeNotes t={t} warnings={warnings} inferred={inferred} />
      </ChakraProvider>,
    );
  });
}

function note(
  rowNumber: number,
  fields: Partial<ImportScopeNoteRow> = {},
): ImportScopeNoteRow {
  return {
    rowNumber,
    page: 3,
    text: "Electricity – Residential",
    sector: "Stationary energy",
    subsector: "Residential buildings",
    value: 16119,
    gpcRefNo: "I.1.2",
    scope: null,
    scopeOrigin: "none",
    originalScope: null,
    ...fields,
  };
}

const cells = (card: Element, row = 0) =>
  [...card.querySelectorAll("tbody tr")[row].querySelectorAll("td")].map(
    (td) => td.textContent,
  );

it("renders warnings as a card with a table of row content", () => {
  render([note(2)], []);

  const card = container.querySelector(
    '[data-testid="import-scope-warnings"]',
  )!;
  expect(card).not.toBeNull();
  expect([...card.querySelectorAll("th")].map((th) => th.textContent)).toEqual([
    "Page",
    "Row in the document",
    "Sector",
    "tCO2e",
    "GPC reference",
    "Scope",
  ]);
  expect(cells(card)).toEqual([
    "3",
    "Electricity – Residential",
    "Stationary energy > Residential buildings",
    "16,119 tCO2e",
    "I.1.2",
    "not provided",
  ]);
  expect(card.textContent).toContain("1 row has no scope we can work out");
  expect(
    container.querySelector('[data-testid="import-inferred-scope"]'),
  ).toBeNull();
});

it("shows the origin for inferred rows", () => {
  render(
    [],
    [
      note(2, { scope: "2", scopeOrigin: "reference" }),
      note(3, { scope: "1", scopeOrigin: "activity-type" }),
      note(4, {
        gpcRefNo: "I.4.4",
        scope: null,
        scopeOrigin: "not-applicable",
      }),
    ],
  );

  expect(
    container.querySelector('[data-testid="import-scope-warnings"]'),
  ).toBeNull();
  const card = container.querySelector(
    '[data-testid="import-inferred-scope"]',
  )!;
  expect(cells(card, 0)[5]).toContain("From GPC reference");
  expect(cells(card, 1)[5]).toContain("From activity type");
  expect(cells(card, 2)[5]).toContain("No scope · outside the total");
  expect(cells(card, 2)[5]).not.toContain("not provided");
  expect(card.textContent).toContain("3 rows with scope notes");
});

it("labels every scope origin", () => {
  render(
    [],
    (
      [
        "document",
        "reference",
        "activity-type",
        "not-applicable",
        "none",
      ] as const
    ).map((scopeOrigin, i) => note(i + 2, { scopeOrigin, scope: "1" })),
  );
  const card = container.querySelector(
    '[data-testid="import-inferred-scope"]',
  )!;
  expect([0, 1, 2, 3, 4].map((i) => cells(card, i)[5])).toEqual([
    expect.stringContaining("From the document"),
    expect.stringContaining("From GPC reference"),
    expect.stringContaining("From activity type"),
    expect.stringContaining("No scope · outside the total"),
    expect.stringContaining("Unknown"),
  ]);
});

it("names the source in the tooltip", () => {
  render(
    [],
    [
      note(2, { scope: "2", scopeOrigin: "reference" }),
      note(3, { scope: "2", scopeOrigin: "activity-type", originalScope: "1" }),
    ],
  );
  const labels = [...container.querySelectorAll('[role="img"]')].map((el) =>
    el.getAttribute("aria-label"),
  );
  expect(labels[0]).toBe(
    "Row 2: I.1.2, scope 2 set from the GPC reference. The document gives no scope.",
  );
  expect(labels[1]).toBe(
    "Row 3: I.1.2, scope 2 set from the activity type. The extraction had scope 1.",
  );
});

it("renders — for a missing page and text", () => {
  render([note(2, { page: null, text: null })], []);
  const card = container.querySelector(
    '[data-testid="import-scope-warnings"]',
  )!;
  const row = cells(card);
  expect(row[0]).toBe("—");
  expect(row[1]).toBe("—");
});

it("collapses after 10 rows", () => {
  render(
    Array.from({ length: 12 }, (_, i) => note(i + 2)),
    [],
  );
  expect(container.querySelectorAll("tbody tr")).toHaveLength(10);
  const showAll = [...container.querySelectorAll("button")].find(
    (button) => button.textContent === "Show all 12 rows",
  );
  expect(showAll).toBeDefined();
  act(() => showAll!.click());
  expect(container.querySelectorAll("tbody tr")).toHaveLength(12);
});

it("renders nothing when both lists are empty", () => {
  render([], []);
  expect(container.querySelector("table")).toBeNull();
  expect(container.textContent).toBe("");
});
