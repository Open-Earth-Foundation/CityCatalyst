/** @jest-environment jsdom */

import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  expect,
  it,
  jest,
} from "@jest/globals";
import { ChakraProvider, defaultSystem } from "@chakra-ui/react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { TFunction } from "i18next";
import type { ImportRowOutcome, ImportRowPreview } from "@/util/types";

let preview: ImportRowPreview | undefined;
const previewQuery = jest.fn((_args: unknown) => ({
  data: preview,
  isFetching: false,
  isError: false,
}));
jest.unstable_mockModule("@/services/api", () => ({
  api: { useGetImportRowPreviewQuery: previewQuery },
}));

const t = ((key: string, values?: Record<string, unknown>) =>
  values ? `${key}:${JSON.stringify(values)}` : key) as unknown as TFunction;

let ImportRowIssues: typeof import("@/components/steps/GHGI/import/import-row-issues").default;
let root: Root;
let container: HTMLDivElement;
const originalStructuredClone = globalThis.structuredClone;

beforeAll(async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  // Chakra clones JSON-compatible recipes; jsdom does not provide structuredClone.
  globalThis.structuredClone = (value) =>
    value === undefined ? value : JSON.parse(JSON.stringify(value));
  ({ default: ImportRowIssues } =
    await import("@/components/steps/GHGI/import/import-row-issues"));
});
afterAll(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = false;
  globalThis.structuredClone = originalStructuredClone;
});
beforeEach(() => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  jest.clearAllMocks();
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function render(mappingOverrides: Record<string, string> = {}) {
  act(() => {
    root.render(
      <ChakraProvider value={defaultSystem}>
        <ImportRowIssues
          t={t}
          cityId="city-1"
          inventoryId="inventory-1"
          importedFileId="file-1"
          mappingOverrides={mappingOverrides}
        />
      </ChakraProvider>,
    );
  });
}

function outcome(
  rowNumber: number,
  fields: Partial<ImportRowOutcome>,
): ImportRowOutcome {
  return {
    rowNumber,
    gpcRefNo: null,
    sourceLabel: null,
    notationKey: null,
    status: "skipped",
    issue: "missing-gpc-reference",
    ...fields,
  };
}

it("shows each rejected row with its source, status and reason", () => {
  preview = {
    totalRows: 5,
    importedRows: 2,
    skippedRows: 3,
    rows: [
      outcome(3, {
        gpcRefNo: "I.1.3",
        status: "not-counted",
        issue: "outside-inventory-type",
      }),
      outcome(4, {}),
      outcome(5, {
        sourceLabel: "Energy / Mystery",
        issue: "gpc-reference-unresolved",
      }),
      outcome(6, {
        gpcRefNo: "I.1.1",
        notationKey: "XX",
        issue: "unknown-notation-key",
      }),
    ],
  };
  render({ "Total CO2e": "totalCO2e", Ignored: "" });

  expect(previewQuery).toHaveBeenCalledWith({
    cityId: "city-1",
    inventoryId: "inventory-1",
    importedFileId: "file-1",
    mappingOverrides: { "Total CO2e": "totalCO2e" },
  });
  const text = container.textContent ?? "";
  expect(text).toContain('import-rows-summary:{"imported":2,"total":5}');
  expect(text).toContain('import-rows-skipped:{"count":3}');
  expect(text).toContain('import-rows-not-counted:{"count":1}');

  const rows = [...container.querySelectorAll("tbody tr")].map((tr) =>
    [...tr.querySelectorAll("td")].map((td) => td.textContent),
  );
  expect(rows).toEqual([
    [
      "3",
      "I.1.3",
      "import-row-status-not-counted",
      'import-row-issue-outside-inventory-type:{"notationKey":null}',
    ],
    [
      "4",
      "import-row-no-reference",
      "import-row-status-skipped",
      'import-row-issue-missing-gpc-reference:{"notationKey":null}',
    ],
    [
      "5",
      "Energy / Mystery",
      "import-row-status-skipped",
      'import-row-issue-gpc-reference-unresolved:{"notationKey":null}',
    ],
    [
      "6",
      "I.1.1",
      "import-row-status-skipped",
      'import-row-issue-unknown-notation-key:{"notationKey":"XX"}',
    ],
  ]);
});

it("collapses long lists until the user asks for all rows", () => {
  preview = {
    totalRows: 12,
    importedRows: 0,
    skippedRows: 12,
    rows: Array.from({ length: 12 }, (_, index) => outcome(index + 2, {})),
  };
  render();

  expect(container.querySelectorAll("tbody tr")).toHaveLength(10);
  const showAll = [...container.querySelectorAll("button")].find((button) =>
    button.textContent?.startsWith("import-rows-show-all"),
  );
  act(() => showAll!.click());
  expect(container.querySelectorAll("tbody tr")).toHaveLength(12);
});

it("confirms when every row will be imported", () => {
  preview = { totalRows: 3, importedRows: 3, skippedRows: 0, rows: [] };
  render();

  expect(container.textContent).toContain('import-rows-all-ok:{"count":3}');
  expect(container.querySelector("table")).toBeNull();
});
