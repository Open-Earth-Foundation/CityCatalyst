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
import {
  GlobalWarmingPotentialTypeEnum,
  InventoryTypeEnum,
} from "@/util/enums";

let inventoryType: InventoryTypeEnum;
const updateInventory = jest.fn((_query: unknown) => ({
  unwrap: async (): Promise<unknown> => ({}),
}));
const showSuccessToast = jest.fn();
const showErrorToast = jest.fn();
jest.unstable_mockModule("@/services/api", () => ({
  api: {
    useGetInventoryQuery: () => ({
      data: {
        inventoryName: "Krakow 2024",
        year: 2024,
        inventoryType,
        globalWarmingPotentialType: GlobalWarmingPotentialTypeEnum.ar6,
      },
    }),
    useUpdateInventoryMutation: () => [updateInventory, { isLoading: false }],
  },
}));
jest.unstable_mockModule("@/hooks/Toasts", () => ({
  UseSuccessToast: () => ({ showSuccessToast }),
  UseErrorToast: () => ({ showErrorToast }),
}));

const t = ((key: string, values?: Record<string, unknown>) =>
  values ? `${key}:${JSON.stringify(values)}` : key) as unknown as TFunction;

let ReportingLevelWarning: typeof import("@/components/steps/GHGI/import/reporting-level-warning").default;
let root: Root;
let container: HTMLDivElement;
const originalStructuredClone = globalThis.structuredClone;

beforeAll(async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  // Chakra clones JSON-compatible recipes; jsdom does not provide structuredClone.
  globalThis.structuredClone = (value) =>
    value === undefined ? value : JSON.parse(JSON.stringify(value));
  ({ default: ReportingLevelWarning } =
    await import("@/components/steps/GHGI/import/reporting-level-warning"));
});
afterAll(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = false;
  globalThis.structuredClone = originalStructuredClone;
});
beforeEach(() => {
  inventoryType = InventoryTypeEnum.GPC_BASIC;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  jest.clearAllMocks();
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function render(references: string[], onSwitched = jest.fn()) {
  act(() => {
    root.render(
      <ChakraProvider value={defaultSystem}>
        <ReportingLevelWarning
          t={t}
          inventoryId="inventory-1"
          references={references}
          onSwitched={onSwitched}
        />
      </ChakraProvider>,
    );
  });
  return onSwitched;
}

it("lists rows outside GPC BASIC and switches the inventory to BASIC+", async () => {
  const onSwitched = render(["I.1.3", "II.1.3"]);

  expect(container.textContent).toContain(
    'rows-outside-basic-title:{"count":2}',
  );
  expect(container.textContent).toContain(
    'rows-outside-basic-description:{"references":"I.1.3, II.1.3"}',
  );

  const button = [...container.querySelectorAll("button")].find((element) =>
    element.textContent?.includes("switch-to-basic-plus"),
  );
  await act(async () => {
    button!.click();
  });

  expect(updateInventory).toHaveBeenCalledWith({
    inventoryId: "inventory-1",
    data: {
      inventoryName: "Krakow 2024",
      year: 2024,
      inventoryType: InventoryTypeEnum.GPC_BASIC_PLUS,
      globalWarmingPotentialType: GlobalWarmingPotentialTypeEnum.ar6,
    },
  });
  expect(showSuccessToast).toHaveBeenCalled();
  expect(onSwitched).toHaveBeenCalled();
});

it("keeps the warning and reports an error when switching fails", async () => {
  updateInventory.mockReturnValueOnce({
    unwrap: async () => {
      throw new Error("network");
    },
  });
  const onSwitched = render(["I.1.3"]);

  const button = container.querySelector("button");
  await act(async () => {
    button!.click();
  });

  expect(showErrorToast).toHaveBeenCalled();
  expect(onSwitched).not.toHaveBeenCalled();
});

it("renders nothing for GPC BASIC+ or when every row is required", () => {
  render([]);
  expect(container.textContent).toBe("");

  inventoryType = InventoryTypeEnum.GPC_BASIC_PLUS;
  render(["I.1.3"]);
  expect(container.textContent).toBe("");
});
