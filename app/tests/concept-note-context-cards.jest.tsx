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
    inventoryYear: null,
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

function controls(label: string): HTMLElement[] {
  return Array.from(
    container.querySelectorAll<HTMLElement>("a, button"),
  ).filter((element) => element.textContent?.trim() === label);
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
    expect(container.querySelector('a[href*="/HIAP/"]')).toBeNull();
    expect(controls("refresh-run-context")).toHaveLength(0);
  });

  it("flags an empty inventory and links to adding data instead of refreshing", async () => {
    await renderTab({ ...withInventory, inventoryHasData: false });

    expect(container.textContent).toContain("inventory-empty");
    expect(container.textContent).toContain("inventory-empty-detail");
    expect(control("refresh-run-context")).toBeUndefined();
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

  it("offers a run refresh when the inventory has data but is not in the run", async () => {
    await renderTab(withInventory);

    expect(container.textContent).toContain("available-in-city");
    expect(container.textContent).toContain("not-included-in-run");
    const refresh = control("refresh-run-context") as HTMLButtonElement;
    expect(refresh.disabled).toBe(false);
    await act(async () => refresh.click());
    expect(onRetryBundle).toHaveBeenCalledTimes(1);
    // Only the inventory card: without prioritized actions the plan card has no action.
    expect(controls("refresh-run-context")).toHaveLength(1);
  });

  it("offers a run refresh when the plan is ready in CityCatalyst but not in the run", async () => {
    await renderTab({
      ...withInventory,
      ...withPlan,
      bundle: bundle({}, { ghgi: true }),
    });

    expect(controls("refresh-run-context")).toHaveLength(1);
    expect(container.textContent).toContain("bundle-source-available");
  });

  it("explains why a refresh is unavailable while drafting runs", async () => {
    await renderTab({ ...withInventory, isDraftRunning: true });

    const refresh = control("refresh-run-context") as HTMLButtonElement;
    expect(refresh.disabled).toBe(true);
    const reason = document.getElementById(
      refresh.getAttribute("aria-describedby") ?? "",
    );
    expect(reason?.textContent).toBe("context-action-draft-running");
  });

  it("shows processing and explains the disabled refresh while the context rebuilds", async () => {
    await renderTab({
      ...withInventory,
      bundle: bundle({ status: "building" }),
    });

    expect((control("refresh-run-context") as HTMLButtonElement).disabled).toBe(
      true,
    );
    expect(container.textContent).toContain("status-processing");
    expect(container.textContent).toContain("context-action-rebuilding");
  });

  it("shows no action for sources already in the run", async () => {
    await renderTab({
      ...withInventory,
      ...withPlan,
      bundle: bundle({}, { ghgi: true, hiap: true }),
    });

    expect(container.textContent).toContain("included-in-run");
    expect(control("refresh-run-context")).toBeUndefined();
    expect(control("create-inventory")).toBeUndefined();
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
