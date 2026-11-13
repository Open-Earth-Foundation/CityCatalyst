/** @jest-environment jsdom */
/**
 * CC-1163: source check cards come first. While a check is pending, the rows
 * that need a decision are read-only, because answering a check can change
 * row values and the server then clears the decisions on those rows.
 */
import { afterAll, beforeAll, describe, expect, it, jest } from "@jest/globals";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { ChakraProvider, defaultSystem } from "@chakra-ui/react";
import type { ImportRowReview } from "@/util/types";
import type { SourceChecks } from "@/util/GHGI/source-checks";

let importStatus: unknown = undefined;

// Every api hook returns empty data; the import status comes from the test.
jest.unstable_mockModule("@/services/api", () => ({
  api: new Proxy(
    {},
    {
      get: (_target, name: string) => {
        if (name === "useGetImportStatusQuery") {
          return () => ({
            data: importStatus,
            isLoading: false,
            refetch: () => {},
          });
        }
        if (name.endsWith("Mutation")) return () => [async () => ({}), {}];
        return () => ({ data: undefined, isLoading: false });
      },
    },
  ),
}));

const { default: ImportReviewRows } =
  await import("@/components/steps/GHGI/import/import-review-rows");
const { default: ReviewConfirmStep } =
  await import("@/components/steps/GHGI/import/review-confirm-step");

const originalStructuredClone = globalThis.structuredClone;
beforeAll(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  (globalThis as unknown as { CSS?: { escape: (v: string) => string } }).CSS ??=
    { escape: (v: string) => v };
  globalThis.structuredClone = (value) =>
    value === undefined ? value : JSON.parse(JSON.stringify(value));
});
afterAll(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = false;
  globalThis.structuredClone = originalStructuredClone;
});

const t = ((key: string) => key) as never;

const row: ImportRowReview = {
  rowIndex: 0,
  issue: "direction-unconfirmed",
  value: 6300,
  notationKey: null,
  suggestedRefNo: "III.4.3",
  chosenRefNo: "III.4.3",
  sector: "Waste",
  subsector: null,
  category: null,
  scope: "1",
  expectedScope: null,
  quote: null,
  quoteFound: null,
  page: null,
  source: null,
  decision: null,
  referenceOptions: ["III.4.1", "III.4.2", "III.4.3"],
};

const PENDING_TOTAL: SourceChecks = {
  total: { status: "pending", candidates: [], selected: null, suggested: null },
};
const CONFIRMED_TOTAL: SourceChecks = {
  total: {
    status: "confirmed",
    candidates: [],
    selected: { value: 412300, origin: "user" },
    suggested: null,
  },
};

async function mount(node: React.ReactNode) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  await act(async () =>
    root.render(<ChakraProvider value={defaultSystem}>{node}</ChakraProvider>),
  );
  return container;
}

/** Keep, Skip and both selects of the row. */
function controls(c: HTMLElement) {
  const buttons = Array.from(
    c.querySelectorAll<HTMLButtonElement>(
      '[data-testid="import-review-row"] button',
    ),
  );
  const selects = Array.from(
    c.querySelectorAll<HTMLSelectElement>(
      '[data-testid="import-review-row"] select',
    ),
  );
  return [...buttons, ...selects];
}

async function mountReview(sourceChecks: SourceChecks | undefined) {
  importStatus = {
    mappingConfiguration: {
      rows: [],
      extractionSummary: {
        reportedTotals: [],
        droppedRows: {},
        importedSum: 0,
        yearAssumed: false,
        sourceChecks,
      },
    },
  };
  return mount(
    <ReviewConfirmStep
      t={t}
      lng="en"
      cityId="city"
      inventoryId="inventory"
      importedFileId="file-a"
      renderRows={(locked) => (
        <ImportReviewRows
          t={t}
          fileId="file-a"
          rows={[row]}
          onDecide={() => {}}
          disabled={locked}
        />
      )}
    />,
  );
}

describe("ImportReviewRows disabled", () => {
  it("disables every decision control and shows the hint", async () => {
    const c = await mount(
      <ImportReviewRows
        t={t}
        fileId="file-a"
        rows={[row]}
        onDecide={() => {}}
        disabled
      />,
    );
    expect(controls(c).length).toBeGreaterThanOrEqual(3);
    expect(controls(c).every((el) => el.disabled)).toBe(true);
    expect(c.textContent).toContain("import-review-locked-by-checks");
  });

  it("is enabled by default", async () => {
    const c = await mount(
      <ImportReviewRows
        t={t}
        fileId="file-a"
        rows={[row]}
        onDecide={() => {}}
      />,
    );
    expect(controls(c).length).toBeGreaterThanOrEqual(3);
    expect(controls(c).some((el) => el.disabled)).toBe(false);
    expect(c.textContent).not.toContain("import-review-locked-by-checks");
  });
});

describe("ReviewConfirmStep rows and checks", () => {
  it("locks the rows while a check is pending, cards first", async () => {
    const c = await mountReview(PENDING_TOTAL);
    expect(controls(c).every((el) => el.disabled)).toBe(true);
    const card = Array.from(c.querySelectorAll("p")).find(
      (p) => p.textContent === "import-total-check-title",
    )!;
    const rows = c.querySelector('[data-testid="import-review-rows"]')!;
    expect(card).toBeTruthy();
    expect(
      card.compareDocumentPosition(rows) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("unlocks the rows when all checks are confirmed", async () => {
    const c = await mountReview(CONFIRMED_TOTAL);
    expect(controls(c).length).toBeGreaterThanOrEqual(3);
    expect(controls(c).some((el) => el.disabled)).toBe(false);
  });

  it("unlocks the rows without source checks", async () => {
    const c = await mountReview(undefined);
    expect(controls(c).length).toBeGreaterThanOrEqual(3);
    expect(controls(c).some((el) => el.disabled)).toBe(false);
  });
});
