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
import { act, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { ConceptNoteRun } from "@/util/types";
import translations from "@/i18n/locales/en/concept-notes.json";

const run = { run_id: "run-1", name: "Disposable note" } as ConceptNoteRun;
const remove = jest.fn<() => Promise<void>>();
const list = jest.fn<() => Promise<{ runs: ConceptNoteRun[] }>>();
const loadRuns = jest.fn((_cityId: string, _preferCache: boolean) => ({
  unwrap: list,
}));
const toast = jest.fn();
jest.unstable_mockModule("@/services/api", () => ({
  api: {
    useRenameConceptNoteRunMutation: () => [jest.fn(), { isLoading: false }],
    useDeleteConceptNoteRunMutation: () => [
      () => ({ unwrap: remove }),
      { isLoading: false },
    ],
    useLazyGetConceptNoteRunsQuery: () => [loadRuns, { isFetching: false }],
  },
}));
jest.unstable_mockModule("@/i18n/client", () => ({
  useTranslation: () => ({
    t: (key: string) => translations[key as keyof typeof translations] ?? key,
  }),
}));
jest.unstable_mockModule("@/components/ui/toaster", () => ({
  toaster: { create: toast },
}));

let Dialog: typeof import("@/components/ConceptNoteDashboard/lifecycle-dialog").ConceptNoteLifecycleDialog;
let root: Root;
let container: HTMLDivElement;
const originalClone = globalThis.structuredClone;
const originalResizeObserver = globalThis.ResizeObserver;
beforeAll(async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  globalThis.structuredClone = (value) =>
    value === undefined ? value : JSON.parse(JSON.stringify(value));
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  ({ ConceptNoteLifecycleDialog: Dialog } =
    await import("@/components/ConceptNoteDashboard/lifecycle-dialog"));
});
function Harness() {
  const [open, setOpen] = useState(true);
  return open ? (
    <Dialog
      action="delete"
      cityId="city-1"
      lng="en"
      run={run}
      onClose={() => setOpen(false)}
    />
  ) : null;
}
beforeEach(async () => {
  jest.clearAllMocks();
  remove.mockReset().mockResolvedValue(undefined);
  list.mockReset().mockResolvedValue({ runs: [] });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () =>
    root.render(
      <ChakraProvider value={defaultSystem}>
        <Harness />
      </ChakraProvider>,
    ),
  );
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});
afterAll(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = false;
  globalThis.structuredClone = originalClone;
  globalThis.ResizeObserver = originalResizeObserver;
});
async function confirm() {
  const button = Array.from(document.querySelectorAll("button")).find(
    (item) => item.textContent === translations["delete-permanently"],
  );
  expect(button).toBeDefined();
  await act(async () => button!.click());
}

it("closes the confirmation after successful deletion", async () => {
  await confirm();
  expect(document.querySelector('[role="dialog"]')).toBeNull();
  expect(loadRuns).not.toHaveBeenCalled();
  expect(toast).toHaveBeenCalledWith({
    title: translations["delete-success"],
    type: "success",
  });
});

it("closes a stale confirmation after verifying the note is absent", async () => {
  remove.mockRejectedValue({ status: 404, data: {} });
  await confirm();
  expect(loadRuns).toHaveBeenCalledWith("city-1", false);
  expect(document.querySelector('[role="dialog"]')).toBeNull();
  expect(toast).toHaveBeenCalledWith({
    title: translations["delete-unavailable"],
    type: "info",
  });
});

it("keeps the dialog and error when a 404 occurs but the note still exists", async () => {
  remove.mockRejectedValue({ status: 404, data: {} });
  list.mockResolvedValue({ runs: [run] });
  await confirm();
  expect(document.querySelector('[role="alert"]')?.textContent).toBe(
    translations["delete-error"],
  );
  expect(toast).not.toHaveBeenCalled();
});

it("does not dismiss an unverified deletion when the authorized list fails", async () => {
  remove.mockRejectedValue({ status: 404, data: {} });
  list.mockRejectedValue({ status: 403, data: {} });
  await confirm();
  expect(document.querySelector('[role="alert"]')?.textContent).toBe(
    translations["delete-error"],
  );
  expect(toast).not.toHaveBeenCalled();
});

it.each([403, 409, 503])(
  "preserves actionable failure handling for HTTP %s",
  async (status) => {
    remove.mockRejectedValue({ status, data: {} });
    await confirm();
    expect(document.querySelector('[role="alert"]')?.textContent).toBe(
      translations[status === 409 ? "delete-conflict" : "delete-error"],
    );
    expect(loadRuns).not.toHaveBeenCalled();
    expect(toast).not.toHaveBeenCalled();
  },
);
