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
import translations from "@/i18n/locales/en/concept-notes.json";

let rejection: unknown;
const save = jest.fn(() => ({
  unwrap: async () => {
    throw rejection;
  },
}));
const onClose = jest.fn();
jest.unstable_mockModule("@/services/api", () => ({
  api: {
    useGetConceptNoteFundingCatalogueQuery: () => ({
      data: {
        funders: [
          {
            id: "new-funder",
            name: "New funder",
            country: null,
            region: null,
            funder_type: null,
            profile: {},
            opportunities: [],
          },
        ],
      },
      isLoading: false,
      isError: false,
    }),
    useUpdateConceptNoteFundingSelectionMutation: () => [
      save,
      { isLoading: false },
    ],
  },
}));
jest.unstable_mockModule("@/i18n/client", () => ({
  useTranslation: () => ({
    t: (key: string) => translations[key as keyof typeof translations] ?? key,
  }),
}));

let FundingSelectionDialog: typeof import("@/components/ConceptNoteWorkspace/funding-selection-dialog").FundingSelectionDialog;
let root: Root;
let container: HTMLDivElement;
const originalResizeObserver = globalThis.ResizeObserver;
const originalStructuredClone = globalThis.structuredClone;

beforeAll(async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  // Chakra clones JSON-compatible recipes; jsdom does not provide structuredClone.
  globalThis.structuredClone = (value) =>
    value === undefined ? value : JSON.parse(JSON.stringify(value));
  globalThis.ResizeObserver = class {
    disconnect() {}
    observe() {}
    unobserve() {}
  };
  ({ FundingSelectionDialog } =
    await import("@/components/ConceptNoteWorkspace/funding-selection-dialog"));
});
afterAll(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = false;
  globalThis.ResizeObserver = originalResizeObserver;
  globalThis.structuredClone = originalStructuredClone;
});
beforeEach(() => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  jest.clearAllMocks();
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

it.each([
  [{ code: "funding_template_incompatible" }, "funding-template-incompatible"],
  ["Funding selection changed", "funding-save-conflict"],
] as const)(
  "keeps the dialog open with the appropriate funding conflict message",
  async (detail, key) => {
    rejection = { status: 409, data: { detail } };
    await act(async () => {
      root.render(
        <ChakraProvider value={defaultSystem}>
          <FundingSelectionDialog
            applicationContext={{
              run_id: "run",
              city_id: "city",
              funder: null,
              opportunity: null,
              template: null,
              included_sources: {
                city: true,
                project: false,
                ghgi: false,
                ccra: false,
                hiap: false,
              },
            }}
            hasDraft={false}
            busy={false}
            lng="en"
            runId="run"
            onClose={onClose}
          />
        </ChakraProvider>,
      );
    });
    async function click(label: string) {
      const button = [...document.querySelectorAll("button")].find((item) =>
        item.textContent?.includes(label),
      );
      expect(button).toBeDefined();
      await act(async () => button!.click());
    }
    await click("New funder");
    await click(translations["funding-save"]);
    expect(save).toHaveBeenCalledTimes(1);
    expect(document.querySelector('[role="alert"]')?.textContent).toBe(
      translations[key],
    );
    expect(onClose).not.toHaveBeenCalled();
  },
);
