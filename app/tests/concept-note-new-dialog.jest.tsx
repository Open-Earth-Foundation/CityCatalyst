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
import { TextDecoder } from "node:util";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import translations from "@/i18n/locales/en/concept-notes.json";

const idleMutation = () => [jest.fn(), { isLoading: false }];
jest.unstable_mockModule("@/services/api", () => ({
  api: {
    useStartConceptNoteRunMutation: idleMutation,
    useCreateChatThreadMutation: idleMutation,
    useUploadConceptNoteSourceMutation: idleMutation,
  },
}));
jest.unstable_mockModule("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn() }),
}));
jest.unstable_mockModule("@/i18n/client", () => ({
  useTranslation: () => ({
    t: (key: string) => translations[key as keyof typeof translations] ?? key,
  }),
}));

let NewConceptNoteDialog: typeof import("@/components/ConceptNoteDashboard/new-concept-note-dialog").NewConceptNoteDialog;
let root: Root;
let container: HTMLDivElement;
let scrolled: Element[];
const originalScrollIntoView = Element.prototype.scrollIntoView;
const originalMatchMedia = window.matchMedia;
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
  // Source validation reads the PDF signature; jsdom lacks TextDecoder.
  Object.assign(globalThis, { TextDecoder });
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    addEventListener() {},
    removeEventListener() {},
  })) as unknown as typeof window.matchMedia;
  Element.prototype.scrollIntoView = function (this: Element) {
    scrolled.push(this);
  };
  ({ NewConceptNoteDialog } =
    await import("@/components/ConceptNoteDashboard/new-concept-note-dialog"));
});
afterAll(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = false;
  globalThis.ResizeObserver = originalResizeObserver;
  globalThis.structuredClone = originalStructuredClone;
  window.matchMedia = originalMatchMedia;
  Element.prototype.scrollIntoView = originalScrollIntoView;
});
beforeEach(async () => {
  scrolled = [];
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  await act(async () => {
    root.render(
      <ChakraProvider value={defaultSystem}>
        <NewConceptNoteDialog
          cityId="city-1"
          cityName="Kraków"
          lng="en"
          onOpenChange={() => {}}
          open
        />
      </ChakraProvider>,
    );
  });
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

async function selectFile(file: File): Promise<void> {
  const input = document.querySelector<HTMLInputElement>("input[type=file]");
  expect(input).not.toBeNull();
  Object.defineProperty(input!, "files", { configurable: true, value: [file] });
  await act(async () => {
    input!.dispatchEvent(new Event("input", { bubbles: true }));
  });
  // Selection validation is async; let it settle.
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

function pdf(name: string): File {
  const file = new File(["%PDF-1.7 plan"], name, { type: "application/pdf" });
  // jsdom blobs cannot be read; serve the PDF signature validation checks.
  return Object.assign(file, {
    slice: () => ({
      arrayBuffer: async () => Uint8Array.from(Buffer.from("%PDF-")).buffer,
    }),
  });
}

it("scrolls the selected file into view", async () => {
  await selectFile(pdf("plan.pdf"));

  const row = [...document.querySelectorAll("p")].find(
    (element) => element.textContent === "plan.pdf",
  );
  expect(row).toBeDefined();
  expect(scrolled).toHaveLength(1);
  expect(scrolled[0].contains(row!)).toBe(true);
});

it("scrolls a selection error into view", async () => {
  await selectFile(new File([], "empty.pdf", { type: "application/pdf" }));

  const alert = document.querySelector('[role="alert"]');
  expect(alert?.textContent).toBe(translations["empty-source-file"]);
  expect(scrolled).toEqual([alert]);
});
