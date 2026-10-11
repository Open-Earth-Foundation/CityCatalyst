/** @jest-environment jsdom */

import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  expect,
  it,
  describe,
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
  createFunder.mockImplementation(() => ({
    unwrap: async () => {
      funders = [
        ...funders,
        {
          id: "added-funder",
          name: "Resilient Futures Fund",
          country: null,
          region: null,
          funder_type: null,
          profile: {},
          opportunities: [
            {
              ...opportunity,
              id: "added-programme",
              added_from: { kind: "manual", filename: null },
            },
          ],
        },
      ];
      return {
        funder_id: "added-funder",
        funding_opportunity_id: "added-programme",
      };
    },
  }));
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
  const button = (label: string) =>
    [...document.querySelectorAll("button")].find((item) =>
      item.textContent?.includes(label),
    )!;
  async function type(label: string, value: string) {
    const labelElement = [...document.querySelectorAll("label")].find((item) =>
      item.textContent?.startsWith(label),
    )!;
    const input = document.getElementById(labelElement.htmlFor)!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )!.set!.call(input, value);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
  }

  await act(async () => button(translations["funder-add-entry"]).click());
  await type(translations["funder-field-name"], "Resilient Futures Fund");
  await type(translations["funder-field-programme-name"], "Resilient Cities");
  await type(translations["funder-field-template-name"], "Concept note");
  // A chapter without a title blocks the request and explains why.
  await act(async () => button(translations["funder-add-submit"]).click());
  expect(createFunder).not.toHaveBeenCalled();
  expect(document.body.textContent).toContain(
    translations["funder-error-chapter-title"],
  );
  await type("Chapter", "Summary");
  await act(async () => button(translations["funder-add-submit"]).click());

  expect(createFunder).toHaveBeenCalledWith({
    runId: "run",
    funder: expect.objectContaining({
      import_id: null,
      funder: expect.objectContaining({ name: "Resilient Futures Fund" }),
      template: expect.objectContaining({
        template_name: "Concept note",
        chapter_schema: [
          expect.objectContaining({ chapter_ref: "", title: "Summary" }),
        ],
      }),
    }),
  });
  const selected = [...document.querySelectorAll("nav button")].find(
    (item) => item.getAttribute("aria-pressed") === "true",
  );
  expect(selected?.textContent).toContain("Resilient Futures Fund");
  expect(
    document.querySelector('[data-testid="concept-note-funder-added-from"]')
      ?.textContent,
  ).toBe(translations["funding-added-by-hand"]);
});

describe("own template", () => {
  const context = {
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
  const ownTemplate = {
    id: "own-template-id",
    name: "City concept note",
    output_format: "DOCX",
    chapter_schema: [
      { chapter_ref: "summary", title: "Summary", required: true },
    ],
    required_fields: [],
  };
  const button = (label: string) =>
    [...document.querySelectorAll("button")].find((item) =>
      item.textContent?.includes(label),
    )!;
  async function type(label: string, value: string) {
    const labelElement = [...document.querySelectorAll("label")].find((item) =>
      item.textContent?.startsWith(label),
    )!;
    const input = document.getElementById(labelElement.htmlFor)!;
    await act(async () => {
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )!.set!.call(input, value);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
  }
  async function renderDialog(applicationContext = context) {
    save.mockImplementation(() => ({ unwrap: async () => ({}) }));
    await act(async () => {
      root.render(
        <ChakraProvider value={defaultSystem}>
          <FundingSelectionDialog
            applicationContext={applicationContext}
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

  it("uses a template defined by hand without a funder", async () => {
    await renderDialog();
    await act(async () => button(translations["template-own-entry"]).click());
    await type(translations["funder-field-template-name"], "City concept note");
    await type("Chapter", "Summary");
    await act(async () => button(translations["template-use-submit"]).click());

    // The chosen template is previewed and becomes the pending selection.
    expect(
      document.querySelector('[data-testid="own-template-details"]')
        ?.textContent,
    ).toContain(translations["template-by-hand"]);
    await act(async () =>
      button(translations["funding-save-and-draft"]).click(),
    );
    expect(save).toHaveBeenCalledWith({
      runId: "run",
      selection: expect.objectContaining({
        funder_id: null,
        selected_funding_opportunity_id: null,
        custom_template: {
          template: expect.objectContaining({
            template_name: "City concept note",
            chapter_schema: [
              expect.objectContaining({ chapter_ref: "", title: "Summary" }),
            ],
          }),
          import_id: null,
        },
        expected_custom_template_id: null,
      }),
    });
  });

  it("shows a saved own template and replaces it with a funder", async () => {
    await renderDialog({
      ...context,
      template: ownTemplate,
      template_source: { kind: "document", filename: "form.pdf" },
    });
    expect(
      document.querySelector('[data-testid="own-template-details"]')
        ?.textContent,
    ).toContain(translations["template-from-file"]);
    // Nothing changed yet, so there is nothing to save.
    const saveButton = () =>
      document.querySelector<HTMLButtonElement>(
        '[data-testid="concept-note-funding-save"]',
      )!;
    expect(saveButton().disabled).toBe(true);

    await act(async () => button("New funder").click());
    await act(async () => saveButton().click());
    expect(save).toHaveBeenCalledWith({
      runId: "run",
      selection: expect.objectContaining({
        funder_id: "new-funder",
        custom_template: null,
        expected_custom_template_id: "own-template-id",
      }),
    });
  });
});

async function openFilledForm() {
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
  const button = (text: string) =>
    [...document.querySelectorAll("button")].find((item) =>
      item.textContent?.includes(text),
    )!;
  await act(async () => button(translations["funder-add-entry"]).click());
  for (const [label, value] of [
    [translations["funder-field-name"], "Delayed funder"],
    [translations["funder-field-programme-name"], "Programme"],
    [translations["funder-field-template-name"], "Template"],
    ["Chapter", "Summary"],
  ]) {
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
  await act(async () => button(translations["funder-add-submit"]).click());
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
  await act(async () => button(translations["funder-add-submit"]).click());
  expect(document.querySelector('[data-testid="add-funder-form"]')).toBeNull();
  expect(button(translations["funder-add-entry"]).disabled).toBe(true);
  expect(button(translations.cancel).disabled).toBe(true);
  await act(async () => button(translations["funder-add-entry"]).click());
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
  const button = await openFilledForm();
  await act(async () => button(translations["funder-add-submit"]).click());
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
  await act(async () => button(translations["try-again"]).click());
  expect(document.body.textContent).not.toContain(
    translations["funder-added-refresh-error"],
  );
  expect(
    document.querySelector('nav button[aria-pressed="true"]')?.textContent,
  ).toContain("Delayed funder");
  expect(refetch).toHaveBeenCalledTimes(2);
  expect(createFunder).toHaveBeenCalledTimes(1);
});
