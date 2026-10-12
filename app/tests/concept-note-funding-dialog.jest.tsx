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
  ConceptNoteApplicationContext,
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
let catalogueFailed = false;

let rejection: unknown;
const save = jest.fn(() => ({
  unwrap: async () => {
    throw rejection;
  },
}));
const onClose = jest.fn();
const createFunder = jest.fn();
const refetch = jest.fn<() => { unwrap: () => Promise<unknown> }>();
jest.unstable_mockModule("@/services/api", () => ({
  api: {
    useGetConceptNoteFundingCatalogueQuery: () => ({
      data: {
        funders,
      },
      isLoading: false,
      isError: catalogueFailed,
      refetch,
    }),
    useUpdateConceptNoteFundingSelectionMutation: () => [
      save,
      { isLoading: false },
    ],
    useCreateConceptNoteFunderMutation: () => [
      createFunder,
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
  catalogueFailed = false;
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
  refetch.mockReturnValue({ unwrap: async () => undefined });
});

const applicationContext: ConceptNoteApplicationContext = {
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
};

async function renderDialog(context = applicationContext) {
  await act(async () => {
    root.render(
      <ChakraProvider value={defaultSystem}>
        <FundingSelectionDialog
          applicationContext={context}
          hasDraft={false}
          busy={false}
          lng="en"
          runId="run"
          onClose={onClose}
        />
      </ChakraProvider>,
    );
  });
}

const button = (label: string) =>
  [...document.querySelectorAll("button")].find((item) =>
    item.textContent?.includes(label),
  )!;

async function click(label: string) {
  await act(async () => button(label).click());
}

async function type(label: string, value: string) {
  const labelNode = [...document.querySelectorAll("label")].find((item) =>
    item.textContent?.startsWith(label),
  )!;
  const input = document.getElementById(labelNode.htmlFor)!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

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
    await renderDialog();
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
    await renderDialog();
    await click("New funder");
    await click(translations["funding-save"]);
    expect(save).toHaveBeenCalledTimes(1);
    expect(document.querySelector('[role="alert"]')?.textContent).toBe(
      translations[key],
    );
    expect(onClose).not.toHaveBeenCalled();
  },
);

async function openFilledForm() {
  await renderDialog();
  await click(translations["funder-add-entry"]);
  for (const [label, value] of [
    [translations["funder-field-name"], "Delayed funder"],
    [translations["funder-field-programme-name"], "Programme"],
    [translations["funder-field-template-name"], "Template"],
    ["Chapter", "Summary"],
  ]) {
    await type(label, value);
  }
  return button;
}

function addCatalogueRow() {
  funders = [
    ...funders.filter((f) => f.id !== "delayed"),
    {
      ...funders[0]!,
      id: "delayed",
      name: "Delayed funder",
      opportunities: [{ ...opportunity, id: "delayed-programme" }],
    },
  ];
  return { funder_id: "delayed", funding_opportunity_id: "delayed-programme" };
}

it("blocks cancel, closing and selection changes while creation is pending", async () => {
  let resolveCreate!: (value: unknown) => void;
  const pending = new Promise((resolve) => {
    resolveCreate = resolve;
  });
  createFunder.mockImplementation(() => ({ unwrap: () => pending }));
  const button = await openFilledForm();
  await click(translations["funder-add-submit"]);
  expect(button(translations["funder-add-submit"]).disabled).toBe(true);
  expect(button(translations["funder-back"]).disabled).toBe(true);
  expect(button("New funder").disabled).toBe(true);
  expect(
    document.querySelector<HTMLButtonElement>('button[aria-label="Close"]')
      ?.disabled,
  ).toBe(true);
  await act(async () => {
    button(translations["funder-back"]).click();
    button("New funder").click();
    document.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
    );
  });
  expect(onClose).not.toHaveBeenCalled();
  await act(async () => resolveCreate(addCatalogueRow()));
  expect(
    document.querySelector('nav button[aria-pressed="true"]')?.textContent,
  ).toContain("Delayed funder");
});

it("keeps controls busy through refresh and sends one create request", async () => {
  let resolveRefresh!: (value: unknown) => void;
  refetch.mockReturnValue({
    unwrap: () =>
      new Promise((resolve) => {
        resolveRefresh = resolve;
      }),
  });
  createFunder.mockImplementation(() => ({
    unwrap: async () => addCatalogueRow(),
  }));
  const button = await openFilledForm();
  await click(translations["funder-add-submit"]);
  expect(document.querySelector('[data-testid="add-funder-form"]')).toBeNull();
  expect(button(translations["funder-add-entry"]).disabled).toBe(true);
  expect(button(translations.cancel).disabled).toBe(true);
  await click(translations["funder-add-entry"]);
  expect(createFunder).toHaveBeenCalledTimes(1);
  await act(async () => resolveRefresh(undefined));
  expect(button(translations["funder-add-entry"]).disabled).toBe(false);
});

it("retries a failed catalogue refresh without repeating a successful create", async () => {
  refetch.mockReturnValueOnce({
    unwrap: async () => {
      catalogueFailed = true;
      throw { status: 503 };
    },
  });
  createFunder.mockImplementation(() => ({
    unwrap: async () => ({
      funder_id: "delayed",
      funding_opportunity_id: "delayed-programme",
    }),
  }));
  await openFilledForm();
  await click(translations["funder-add-submit"]);
  expect(createFunder).toHaveBeenCalledTimes(1);
  expect(document.querySelector('[data-testid="add-funder-form"]')).toBeNull();
  expect(document.body.textContent).toContain(
    translations["funder-added-refresh-error"],
  );

  refetch.mockImplementationOnce(() => {
    catalogueFailed = false;
    addCatalogueRow();
    return { unwrap: async () => undefined };
  });
  await click(translations["try-again"]);
  expect(document.body.textContent).not.toContain(
    translations["funder-added-refresh-error"],
  );
  expect(
    document.querySelector('nav button[aria-pressed="true"]')?.textContent,
  ).toContain("Delayed funder");
  expect(refetch).toHaveBeenCalledTimes(2);
  expect(createFunder).toHaveBeenCalledTimes(1);
});
