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
      refetch: async () => undefined,
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

it("adds a funder entered by hand and selects it", async () => {
  const newFunderId = "added-funder";
  const newProgrammeId = "added-programme";
  const createFunder = jest.fn(async (request: unknown) => {
    const body = request as {
      funder: { name: string };
      opportunity: { name: string };
      template: { template_name: string };
    };
    funders = [
      ...funders,
      {
        id: newFunderId,
        name: body.funder.name,
        country: null,
        region: null,
        funder_type: null,
        profile: {},
        opportunities: [
          {
            ...opportunity,
            id: newProgrammeId,
            name: body.opportunity.name,
            added_from: { kind: "manual", filename: null },
          },
        ],
      },
    ];
    return {
      funder_id: newFunderId,
      funding_opportunity_id: newProgrammeId,
    };
  });
  const flow = {
    phase: "idle" as const,
    funderImport: null,
    failure: null,
    filename: null,
    pageCount: null,
    error: null,
    retrying: false,
    discarding: false,
    creating: false,
    uploadFile: jest.fn(async () => undefined),
    retry: jest.fn(async () => undefined),
    discard: jest.fn(async () => undefined),
    chooseAnotherFile: jest.fn(),
    createFunder,
  };
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
          addFunder={flow}
        />
      </ChakraProvider>,
    );
  });
  const button = (label: string) =>
    [...document.querySelectorAll("button")].find((item) =>
      item.textContent?.includes(label),
    );
  async function type(label: string, value: string) {
    const labelElement = [...document.querySelectorAll("label")].find(
      (item) => item.textContent === `${label} *`,
    );
    const input = document.getElementById(
      labelElement!.htmlFor,
    ) as HTMLInputElement;
    await act(async () => {
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )!.set!.call(input, value);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
  }

  await act(async () => button(translations["funder-add-entry"])!.click());
  await act(async () => button(translations["funder-add-manual"])!.click());
  const submit = () =>
    document.querySelector<HTMLButtonElement>(
      '[data-testid="concept-note-add-funder"]',
    )!;
  expect(submit().disabled).toBe(true);
  await type(translations["funder-field-name"], "Resilient Futures Fund");
  await type(translations["funder-field-programme-name"], "Resilient Cities");
  await type(translations["funder-field-template-name"], "Concept note");
  expect(submit().disabled).toBe(true);
  await type(translations["funder-field-chapter-title"], "Summary");
  expect(submit().disabled).toBe(false);
  await act(async () => submit().click());

  expect(createFunder).toHaveBeenCalledWith(
    expect.objectContaining({
      import_id: null,
      funder: expect.objectContaining({ name: "Resilient Futures Fund" }),
      opportunity: expect.objectContaining({
        name: "Resilient Cities",
        min_award: null,
        max_award: null,
      }),
      template: expect.objectContaining({
        template_name: "Concept note",
        chapter_schema: [
          expect.objectContaining({ chapter_ref: "", title: "Summary" }),
        ],
      }),
    }),
  );
  const selected = [...document.querySelectorAll("nav button")].find(
    (item) => item.getAttribute("aria-pressed") === "true",
  );
  expect(selected?.textContent).toContain("Resilient Futures Fund");
  expect(
    document.querySelector('[data-testid="concept-note-funder-added-from"]')
      ?.textContent,
  ).toBe(translations["funding-added-by-hand"]);
  expect(
    button(translations["funding-save-and-draft"]) ??
      button(translations["funding-save"]),
  ).toBeDefined();
});
