/** @jest-environment jsdom */

import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from "@jest/globals";
import { ChakraProvider, defaultSystem } from "@chakra-ui/react";
import { act, type ComponentProps, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { LuDatabase } from "react-icons/lu";

import type { ConceptNoteBundleProgress } from "@/components/ConceptNoteDashboard/utils";
import type { ConceptNoteContextPresentation } from "@/components/ConceptNoteWorkspace/context-status";
import type {
  CityDashboardResponse,
  ConceptNoteApplicationContext,
} from "@/util/types";

jest.unstable_mockModule("@/i18n/client", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
jest.unstable_mockModule("next/link", () => ({
  default: ({
    children,
    href,
    ...props
  }: {
    children: ReactNode;
    href: string;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

let ContextTab: typeof import("@/components/ConceptNoteWorkspace/context-tab").ContextTab;
let container: HTMLDivElement;
let root: Root;

const onRetryBundle = jest.fn();
const onSelectFunding = jest.fn();

function bundle(
  overrides: Partial<ConceptNoteBundleProgress> = {},
  availableContext: Partial<ConceptNoteBundleProgress["availableContext"]> = {},
): ConceptNoteBundleProgress {
  return {
    status: "ready",
    documentGrounding: null,
    availableContext: {
      city: true,
      project: false,
      ghgi: false,
      ccra: false,
      hiap: false,
      uploadedDocuments: false,
      ...availableContext,
    },
    missingContext: [],
    readySources: 0,
    queuedSources: 0,
    processingSources: 0,
    failedSources: 0,
    cityPopulation: null,
    ghgiStatus: null,
    hiapStatus: null,
    sourceProvenance: { ghgi: null, hiap: null },
    buildId: null,
    contextChanges: [],
    selectedInventoryId: null,
    retryable: false,
    ...overrides,
  };
}

const applicationContext: ConceptNoteApplicationContext = {
  run_id: "run-1",
  city_id: "city-1",
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

type ContextTabProps = ComponentProps<
  typeof import("@/components/ConceptNoteWorkspace/context-tab").ContextTab
>;

async function renderTab(overrides: Partial<ContextTabProps> = {}) {
  const props: ContextTabProps = {
    applicationContext,
    onSelectFunding,
    fundingLoading: false,
    fundingError: false,
    onRetryFunding: () => {},
    bundle: bundle(),
    contextStatus: {
      state: "ready",
      busy: false,
      blocked: false,
      actionIcon: LuDatabase,
      icon: LuDatabase,
    } as unknown as ConceptNoteContextPresentation,
    cityDashboard: null,
    cityDashboardFailed: false,
    cityDashboardLoading: false,
    cityFilesCount: 0,
    cityId: "city-1",
    cityName: "Test City",
    country: null,
    firstCityFile: null,
    inventoryAvailable: false,
    inventoryFailed: false,
    inventoryHasData: false,
    inventoryId: null,
    inventoryLoading: false,
    inventoryOptions: [],
    inventorySelectionSaving: false,
    inventoryYear: null,
    onSelectInventory: async () => {},
    isDraftRunning: false,
    isRetryingBundle: false,
    isRetryingUpload: false,
    isUploading: false,
    lng: "en",
    manualPopulation: null,
    manualPopulationSaving: false,
    onRetryBundle,
    onRetryUpload: () => {},
    onSaveManualPopulation: async () => {},
    onUploadFile: async () => {},
    populationFailed: false,
    populationLabel: "population",
    populationLoading: false,
    populationMissing: false,
    upload: null,
    uploadError: null,
    ...overrides,
  };
  await act(async () =>
    root.render(
      <ChakraProvider value={defaultSystem}>
        <ContextTab {...props} />
      </ChakraProvider>,
    ),
  );
}

function control(label: string): HTMLElement | undefined {
  return Array.from(
    container.querySelectorAll<HTMLElement>("a, button"),
  ).filter((element) => element.textContent?.trim() === label)[0];
}

/** The inventory year chip; its tooltip names the action. */
function inventoryChip(): HTMLButtonElement | null {
  return container.querySelector<HTMLButtonElement>(
    'button[title="inventory-choose-different"]',
  );
}

beforeAll(async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  globalThis.structuredClone = (value) =>
    value === undefined ? value : JSON.parse(JSON.stringify(value));
  ({ ContextTab } =
    await import("@/components/ConceptNoteWorkspace/context-tab"));
});

afterAll(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = false;
});

beforeEach(() => {
  jest.clearAllMocks();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

const withInventory = {
  inventoryAvailable: true,
  inventoryHasData: true,
  inventoryId: "inv-1",
  inventoryYear: 2023,
};
const withPlan = {
  cityDashboard: {
    widgets: { hiap: { mitigation: { rankedActions: [{ id: "action" }] } } },
  } as unknown as CityDashboardResponse,
};

describe("Context tab missing-state cards", () => {
  it("hides the climate risk assessment card", async () => {
    await renderTab();

    expect(container.textContent).not.toContain("climate-risk-assessment");
    expect(container.textContent).not.toContain("ccra-not-in-bundle");
  });

  it("links to inventory setup in a new tab when the city has no inventory", async () => {
    await renderTab();

    const create = control("create-inventory") as HTMLAnchorElement;
    expect(create.getAttribute("href")).toBe(
      "/en/cities/city-1/GHGI/onboarding",
    );
    expect(create.getAttribute("target")).toBe("_blank");
    expect(container.textContent).toContain("ghgi-why");
    expect(container.textContent).toContain("source-help-run-unavailable");
    expect(inventoryChip()).toBeNull();
    expect(container.querySelector('a[href*="/HIAP/"]')).toBeNull();
  });

  it("flags an empty inventory and links to filling it", async () => {
    await renderTab({ ...withInventory, inventoryHasData: false });

    expect(container.textContent).toContain("inventory-empty");
    expect(container.textContent).toContain("inventory-empty-detail");
    expect(inventoryChip()).toBeNull();
    const add = control("add-inventory-data") as HTMLAnchorElement;
    expect(add.getAttribute("href")).toBe("/en/cities/city-1/GHGI/inv-1/data");
    expect(add.getAttribute("target")).toBe("_blank");
  });

  it("flags an empty inventory even when the run already includes it", async () => {
    await renderTab({
      ...withInventory,
      inventoryHasData: false,
      bundle: bundle({}, { ghgi: true }),
    });

    expect(container.textContent).toContain("inventory-empty");
    expect(control("add-inventory-data")).toBeDefined();
  });

  const twoInventories = [
    { year: 2025, inventoryId: "inv-1", lastUpdate: new Date() },
    { year: 2023, inventoryId: "inv-old", lastUpdate: new Date() },
  ] as unknown as ContextTabProps["inventoryOptions"];

  it("keeps choosing available when the newest inventory is empty", async () => {
    await renderTab({
      ...withInventory,
      inventoryHasData: false,
      inventoryOptions: twoInventories,
    });

    expect(container.textContent).toContain("inventory-empty");
    const add = control("add-inventory-data") as HTMLAnchorElement;
    expect(add.getAttribute("href")).toBe("/en/cities/city-1/GHGI/inv-1/data");
    await act(async () => inventoryChip()?.click());
    expect(document.body.textContent).toContain("inventory-choose-title");
  });

  it("does not judge a chosen older inventory by the newest one's data", async () => {
    await renderTab({
      ...withInventory,
      inventoryHasData: false,
      inventoryOptions: twoInventories,
      bundle: bundle(
        {
          selectedInventoryId: "inv-old",
          sourceProvenance: {
            ghgi: { inventoryId: "inv-old", inventoryYear: 2023 },
            hiap: null,
          },
        },
        { ghgi: true },
      ),
    });

    expect(container.textContent).toContain("included-in-run");
    expect(container.textContent).not.toContain("inventory-empty");
    expect(control("add-inventory-data")).toBeUndefined();
    expect(inventoryChip()).not.toBeNull();
  });

  it("explains that an inventory with data is picked up automatically", async () => {
    await renderTab(withInventory);

    expect(container.textContent).toContain("available-in-city");
    expect(container.textContent).toContain("source-help-run-available");
    expect(control("refresh-run-context")).toBeUndefined();
    expect(inventoryChip()).not.toBeNull();
  });

  it("shows the inventory year as a chip beside the status, with a GHGI link", async () => {
    await renderTab({
      ...withInventory,
      bundle: bundle(
        {
          sourceProvenance: {
            ghgi: { inventoryId: "inv-1", inventoryYear: 2023 },
            hiap: null,
          },
        },
        { ghgi: true },
      ),
    });

    const chip = inventoryChip() as HTMLButtonElement;
    expect(chip.textContent).toContain("inventory-year");
    expect(chip.getAttribute("aria-haspopup")).toBe("dialog");
    // The chip shares a row with the status badge instead of a second line.
    expect(chip.parentElement?.textContent).toContain("included-in-run");
    const ghgiLink = container.querySelector<HTMLAnchorElement>(
      'a[title="inventory-open-in-ghgi"]',
    );
    expect(ghgiLink?.getAttribute("href")).toBe("/en/cities/city-1/GHGI/inv-1");
    expect(ghgiLink?.getAttribute("target")).toBe("_blank");
  });

  it("opens the inventory picker from Choose different", async () => {
    await renderTab({
      ...withInventory,
      bundle: bundle({}, { ghgi: true }),
      inventoryOptions: [
        { year: 2024, inventoryId: "inv-1", lastUpdate: new Date() },
      ] as unknown as ContextTabProps["inventoryOptions"],
    });

    await act(async () => inventoryChip()?.click());
    expect(document.body.textContent).toContain("inventory-choose-title");
  });

  it("marks an included inventory with missing sectors as partial", async () => {
    await renderTab({
      ...withInventory,
      bundle: bundle({ ghgiStatus: "partial" }, { ghgi: true }),
    });

    expect(container.textContent).toContain("included-partial");
    expect(container.textContent).toContain("inventory-partial");
  });

  it("explains why choosing is unavailable while drafting runs", async () => {
    await renderTab({ ...withInventory, isDraftRunning: true });

    const choose = inventoryChip() as HTMLButtonElement;
    expect(choose.disabled).toBe(true);
    const reason = document.getElementById(
      choose.getAttribute("aria-describedby") ?? "",
    );
    expect(reason?.textContent).toBe("context-action-draft-running");
  });

  it("shows processing while the context rebuilds", async () => {
    await renderTab({
      ...withInventory,
      bundle: bundle({ status: "building" }),
    });

    expect(container.textContent).toContain("status-processing");
    expect(inventoryChip()).toBeNull();
  });

  it("shows the included state and no refresh control", async () => {
    await renderTab({
      ...withInventory,
      ...withPlan,
      bundle: bundle({}, { ghgi: true, hiap: true }),
    });

    expect(container.textContent).toContain("included-in-run");
    expect(control("refresh-run-context")).toBeUndefined();
    expect(control("create-inventory")).toBeUndefined();
  });

  it("gives the Climate Action Plan card no action", async () => {
    await renderTab({ ...withInventory, ...withPlan });

    expect(container.textContent).toContain("bundle-source-available");
    expect(
      container.querySelectorAll('button[title="inventory-choose-different"]'),
    ).toHaveLength(1);
    expect(container.querySelector('a[href*="/HIAP/"]')).toBeNull();
  });

  it("withholds the inventory action while the inventory loads", async () => {
    await renderTab({ inventoryLoading: true });

    expect(control("create-inventory")).toBeUndefined();
    expect(container.textContent).toContain("status-processing");
  });

  it("does not offer to create an inventory when the lookup failed", async () => {
    await renderTab({ inventoryFailed: true });

    expect(control("create-inventory")).toBeUndefined();
    expect(container.textContent).toContain("status-failed");
    expect(container.textContent).toContain("source-help-failed");
  });

  it("opens funding selection from the missing template card", async () => {
    await renderTab();

    expect(container.textContent).toContain("template-why");
    expect(container.textContent).toContain("funder-why");
    await act(async () => control("template-choose")?.click());
    expect(onSelectFunding).toHaveBeenCalledTimes(1);
  });
});
