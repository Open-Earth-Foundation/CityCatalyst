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
import { ChakraProvider } from "@chakra-ui/react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { TFunction } from "i18next";
import type { YearSelectorItem } from "@/components/shared/YearSelector";

let YearSelector: typeof import("@/components/shared/YearSelector").YearSelector;
let appTheme: typeof import("@/lib/theme/recipes/app-theme").appTheme;
let root: Root;
let container: HTMLDivElement;
const originalStructuredClone = globalThis.structuredClone;
const onYearSelect = jest.fn<(item: YearSelectorItem) => void>();
const onSubmit = jest.fn();
const t = ((key: string) => key) as TFunction;
const inventories: YearSelectorItem[] = [
  2024, 2023, 2023, 2022, 2021, 2020, 2020, 2019,
].map((year, index) => ({
  year,
  inventoryId: `inventory-${index}`,
  lastUpdate: new Date("2026-10-21T12:00:00Z"),
}));

beforeAll(async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  // Chakra clones JSON-compatible recipes; jsdom does not provide structuredClone.
  globalThis.structuredClone = (value) =>
    value === undefined ? value : JSON.parse(JSON.stringify(value));
  ({ YearSelector } = await import("@/components/shared/YearSelector"));
  ({ appTheme } = await import("@/lib/theme/recipes/app-theme"));
});

afterAll(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = false;
  globalThis.structuredClone = originalStructuredClone;
});

beforeEach(() => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  jest.restoreAllMocks();
});

async function render(
  currentInventoryId: string | null = inventories[0].inventoryId,
  items = inventories,
) {
  await act(async () => {
    root.render(
      <ChakraProvider value={appTheme}>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            onSubmit();
          }}
        >
          <YearSelector
            inventories={items}
            currentInventoryId={currentInventoryId}
            lng="en"
            t={t}
            onYearSelect={onYearSelect}
          />
        </form>
      </ChakraProvider>,
    );
  });
}

function cards(): HTMLElement[] {
  return [...container.querySelectorAll('[data-testid="inventory-year"]')].map(
    (year) => year.closest(".chakra-card__root") as HTMLElement,
  );
}

function disclosure(): HTMLButtonElement {
  return container.querySelector<HTMLButtonElement>("button[aria-expanded]")!;
}

async function toggleDisclosure() {
  act(() => disclosure().focus());
  await act(async () => disclosure().click());
}

it("renders focusable native buttons and exposes selection by inventory ID", async () => {
  await render(inventories[2].inventoryId);
  for (const [index, card] of cards().entries()) {
    expect(card.tagName).toBe("BUTTON");
    expect(card.getAttribute("type")).toBe("button");
    expect(card.tabIndex).toBe(0);
    expect(card.getAttribute("aria-pressed")).toBe(String(index === 2));
  }

  await render(null);
  expect(
    cards().every((card) => card.getAttribute("aria-pressed") === "false"),
  ).toBe(true);
});

it("selects the correct inventory when years repeat without submitting a form", async () => {
  await render();
  act(() => cards()[2].click());

  expect(onYearSelect).toHaveBeenCalledTimes(1);
  expect(onYearSelect).toHaveBeenCalledWith(inventories[2]);
  expect(onSubmit).not.toHaveBeenCalled();
  expect(
    container.querySelector('[data-testid="inventory-last-updated"]')
      ?.textContent,
  ).toBe("last-update: 21/10/2026");
});

it("keeps additional inventories selectable when expanded and can collapse again", async () => {
  await render();
  expect(disclosure().getAttribute("aria-expanded")).toBe("false");
  expect(disclosure().textContent).toContain("view-more");
  await toggleDisclosure();

  expect(disclosure().getAttribute("aria-expanded")).toBe("true");
  expect(disclosure().textContent).toContain("view-less");
  expect(cards()).toHaveLength(8);
  act(() => cards()[6].click());
  expect(onYearSelect).toHaveBeenCalledWith(inventories[6]);

  await toggleDisclosure();
  expect(disclosure().getAttribute("aria-expanded")).toBe("false");
});

it("does not warn about duplicate keys in either inventory grid", async () => {
  const errors = jest.spyOn(console, "error").mockImplementation(() => {});
  await render();
  await toggleDisclosure();
  await render(inventories[6].inventoryId, [...inventories].reverse());

  expect(errors).not.toHaveBeenCalled();
});

it("omits the disclosure when there are no additional inventories", async () => {
  await render(null, inventories.slice(0, 4));
  expect(disclosure()).toBeNull();
  expect(cards()).toHaveLength(4);

  await render(null, []);
  expect(disclosure()).toBeNull();
  expect(cards()).toHaveLength(0);
});
