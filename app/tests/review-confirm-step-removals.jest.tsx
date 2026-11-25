/** @jest-environment jsdom */
/**
 * CC-1161: the review screen warns when forestry removals may be missing and drops
 * the "adds up to the total the document reports" note in that case.
 */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, jest } from "@jest/globals";
import { ChakraProvider } from "@chakra-ui/react";
import type { TFunction } from "i18next";
import { appTheme } from "@/lib/theme/recipes/app-theme";
import type {
  ExtractionSummary,
  ReportedTotal,
} from "@/util/GHGI/extraction-summary";

let importStatus: unknown;

/** Query hooks are read as objects, mutation hooks as tuples: serve both. */
const hook = () =>
  Object.assign([jest.fn(), { isLoading: false }], {
    data: undefined,
    isLoading: false,
    refetch: jest.fn(),
  });

jest.unstable_mockModule("@/services/api", () => ({
  api: new Proxy(
    {},
    {
      get: (_target, name) =>
        name === "useGetImportStatusQuery"
          ? () => ({ data: importStatus, isLoading: false, refetch: jest.fn() })
          : hook,
    },
  ),
}));

const { default: ReviewConfirmStep } =
  await import("@/components/steps/GHGI/import/review-confirm-step");

const t = ((key: string, values?: Record<string, unknown>) =>
  values ? `${key}:${JSON.stringify(values)}` : key) as unknown as TFunction;

const GROSS = 785873;
const REMOVALS = -811512;
const NET = GROSS + REMOVALS;

const reported = (value: number, label: string): ReportedTotal => ({
  label,
  value,
  year: 2022,
  scope: null,
  sector: null,
  subsector: null,
  level: "total",
});

const summary = (extra: Partial<ExtractionSummary>): ExtractionSummary => ({
  reportedTotals: [reported(GROSS, "Total Gross Emissions")],
  droppedRows: {},
  importedSum: GROSS,
  yearAssumed: false,
  targetYear: 2022,
  pageSelection: "reconciled",
  selectedPages: [12, 13, 14, 15],
  ...extra,
});

let root: Root;
let container: HTMLDivElement;

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  globalThis.structuredClone = (value) => JSON.parse(JSON.stringify(value));
  container = document.createElement("div");
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  globalThis.IS_REACT_ACT_ENVIRONMENT = false;
});

async function renderWith(extractionSummary: ExtractionSummary) {
  importStatus = { mappingConfiguration: { extractionSummary }, rowCount: 34 };
  await act(async () =>
    root.render(
      <ChakraProvider value={appTheme}>
        <ReviewConfirmStep
          t={t}
          cityId="city"
          inventoryId="inventory"
          importedFileId="file"
        />
      </ChakraProvider>,
    ),
  );
  return container.textContent ?? "";
}

it("warns about an orphan removals total and hides the reconciled note", async () => {
  const text = await renderWith(
    summary({
      reportedTotals: [
        reported(GROSS, "Total Gross Emissions"),
        reported(NET, "Total Net Emissions (including Forestry)"),
        reported(REMOVALS, "Forestry removals"),
      ],
      orphanRemovals: [REMOVALS],
    }),
  );
  expect(text).toContain("import-removals-title");
  // The component formats with the runtime locale: 811,512 (en) or 811.512 (pt).
  expect(text).toMatch(/import-removals-orphan:\{"removals":"811[.,\s ]512"\}/);
  expect(text).not.toContain("import-pages-reconciled");
});

it("warns when the document reports a net total the rows do not reach", async () => {
  const text = await renderWith(
    summary({
      reportedTotals: [
        reported(GROSS, "Total Gross Emissions"),
        reported(NET, "Total Net Emissions (including Forestry)"),
      ],
    }),
  );
  expect(text).toMatch(
    /import-removals-gross-only:\{"net":"[-−]25[.,\s ]639"\}/,
  );
  expect(text).not.toContain("import-removals-orphan");
  expect(text).not.toContain("import-pages-reconciled");
});

it("keeps the reconciled note and shows no removals warning without a net total", async () => {
  const text = await renderWith(summary({}));
  expect(text).toContain("import-pages-reconciled");
  expect(text).not.toContain("import-removals-title");
});

it("names the removals figure in the English orphan copy", async () => {
  const { readFileSync } = await import("node:fs");
  const en = JSON.parse(
    readFileSync("src/i18n/locales/en/onboarding.json", "utf8"),
  ) as Record<string, string>;
  const copy = en["import-removals-orphan"].replace("{{removals}}", "811,512");
  expect(copy).toBe(
    "The document reports forestry removals of 811,512 tCO2e and totals with and without them. This import has no line items for the removals, so it matches the total without them. Confirm this is intended.",
  );
});
