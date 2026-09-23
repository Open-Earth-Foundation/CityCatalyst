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
import type {
  ConceptNoteFunder,
  ConceptNoteFundingOpportunity,
} from "@/util/types";

const opportunity: ConceptNoteFundingOpportunity = {
  id: "programme-internal-id",
  name: "Green Cities Programme",
  applicant_type: null,
  category: null,
  sector: "Transport",
  region_scope: "Europe",
  finance_route: null,
  instrument_type: null,
  min_award: null,
  max_award: null,
  currency: "EUR",
  status: null,
  summary: "Low-carbon mobility",
  hazards: [],
  interventions: [],
  known_gaps: [],
  template: {
    id: "template-internal-id",
    name: "Hidden template keyword",
    output_format: "docx",
    chapter_schema: [],
    required_fields: [],
  },
};
let funders: ConceptNoteFunder[];

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
        funders,
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
let FundingOpportunityDetails: typeof import("@/components/ConceptNoteWorkspace/funding-details").FundingOpportunityDetails;
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
  ({ FundingOpportunityDetails } =
    await import("@/components/ConceptNoteWorkspace/funding-details"));
});
afterAll(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = false;
  globalThis.ResizeObserver = originalResizeObserver;
  globalThis.structuredClone = originalStructuredClone;
});
beforeEach(() => {
  funders = [
    {
      id: "new-funder",
      name: "New funder",
      country: "Poland",
      region: "Europe",
      funder_type: null,
      profile: { internal: "profile-only-keyword" },
      opportunities: [opportunity],
    },
  ];
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  jest.clearAllMocks();
});

it.each([
  ["NEW funder", true],
  ["poland", true],
  ["europe", true],
  ["green cities", true],
  ["transport", true],
  ["poland mobility", true],
  ["new-funder", false],
  ["programme-internal-id", false],
  ["hidden template keyword", false],
  ["profile-only-keyword", false],
  ["region_scope", false],
] as const)(
  "searches visible funding fields for %s",
  async (query, matches) => {
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
    const input = document.querySelector<HTMLInputElement>("#funding-search")!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )!.set!.call(input, query);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    const funderButton = [...document.querySelectorAll("nav button")].find(
      (button) => button.textContent?.includes("New funder"),
    );
    expect(Boolean(funderButton)).toBe(matches);
  },
);

it.each([
  ["123456.78", "123,457"],
  ["0", "0"],
  ["Negotiable", "Negotiable"],
  ["Infinity", "Infinity"],
  [null, translations["not-available"]],
  ["  ", translations["not-available"]],
] as const)(
  "renders award %s without invalid numeric formatting",
  async (value, expected) => {
    await act(async () => {
      root.render(
        <ChakraProvider value={defaultSystem}>
          <FundingOpportunityDetails
            opportunity={{
              ...opportunity,
              min_award: value,
              max_award: "2000000",
            }}
            lng="en"
          />
        </ChakraProvider>,
      );
    });
    const label = [...container.querySelectorAll("dt")].find(
      (item) => item.textContent === translations["funding-award"],
    );
    expect(label?.nextElementSibling?.textContent).toBe(
      `${expected} – 2,000,000 EUR`,
    );
  },
);
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
