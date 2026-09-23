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
import type { ConceptNoteApplicationContext } from "@/util/types";

const context: ConceptNoteApplicationContext = {
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
let initialContext: ConceptNoteApplicationContext | undefined;
let finishRefetch: (success: boolean) => void;
const refetch = jest.fn<() => Promise<{ isSuccess: boolean }>>();

jest.unstable_mockModule("@/i18n/client", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));
jest.unstable_mockModule("@/services/api", () => ({
  api: {
    useConfirmConceptNoteChapterMutation: () => [jest.fn(), {}],
    useResolveConceptNoteGapMutation: () => [jest.fn(), {}],
  },
}));
jest.unstable_mockModule(
  "@/components/ConceptNoteWorkspace/use-concept-note-workspace-data",
  () => ({
    useConceptNoteWorkspaceData: () => {
      const [applicationContext, setContext] = useState(initialContext);
      refetch.mockImplementation(
        () =>
          new Promise((resolve) => {
            finishRefetch = (success) => {
              if (success) setContext(context);
              resolve({ isSuccess: success });
            };
          }),
      );
      return {
        applicationContext,
        applicationContextFailed: !applicationContext,
        applicationContextLoading: false,
        refetchApplicationContext: refetch,
        reviewAvailabilityDescription: "review-setup-load-error",
        run: {
          run_id: "run",
          city_id: "city",
          name: "Test note",
          status: "active",
          workflow_step: "assembling_context",
          thread_id: null,
          progress_summary: {},
        },
        files: [],
        bundle: { availableContext: { uploadedDocuments: false } },
        contextStatus: { busy: false },
        retryBundleState: {},
        retryUploadState: {},
        startDraftState: {},
        uploadState: {},
      };
    },
  }),
);
jest.unstable_mockModule(
  "@/components/ConceptNoteWorkspace/use-concept-note-edits",
  () => ({
    useConceptNoteEdits: () => ({ proposals: [] }),
  }),
);
jest.unstable_mockModule(
  "@/components/ConceptNoteWorkspace/use-inline-review-decisions",
  () => ({
    useInlineReviewDecisions: () => ({ decisions: {} }),
  }),
);
jest.unstable_mockModule(
  "@/components/ConceptNoteWorkspace/document-review",
  () => ({
    DocumentReviewToolbar: () => null,
    DocumentReviewFeedback: () => null,
    documentReviewChanges: () => [],
    selectReviewProposal: () => null,
  }),
);
// The draft tab's setup button calls the workspace handler under test.
jest.unstable_mockModule("@/components/ConceptNoteWorkspace/draft-tab", () => ({
  DraftTab: ({ onOpenFundingSetup }: { onOpenFundingSetup: () => void }) => (
    <button aria-label="open-funding-setup" onClick={onOpenFundingSetup} />
  ),
}));
// Keep workspace state; unrelated panels are outside this test.
for (const [path, name] of [
  ["chat-panel", "ConceptNoteChatPanel"],
  ["context-tab", "ContextTab"],
  ["structure-tab", "StructureTab"],
  ["export-dialog", "ExportDialog"],
  ["start-new-chat-dialog", "StartNewChatDialog"],
]) {
  jest.unstable_mockModule(`@/components/ConceptNoteWorkspace/${path}`, () => ({
    [name]: () => null,
  }));
}
jest.unstable_mockModule(
  "@/components/ConceptNoteWorkspace/funding-selection-dialog",
  () => ({
    FundingSelectionDialog: () => <div role="dialog" />,
  }),
);

let ConceptNoteWorkspace: typeof import("@/components/ConceptNoteWorkspace").ConceptNoteWorkspace;
let root: Root;
let container: HTMLDivElement;
const originalResizeObserver = globalThis.ResizeObserver;
const originalStructuredClone = globalThis.structuredClone;
beforeAll(async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  globalThis.structuredClone = (value) =>
    value === undefined ? value : JSON.parse(JSON.stringify(value));
  globalThis.ResizeObserver = class {
    disconnect() {}
    observe() {}
    unobserve() {}
  };
  ({ ConceptNoteWorkspace } =
    await import("@/components/ConceptNoteWorkspace"));
});
afterAll(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = false;
  globalThis.ResizeObserver = originalResizeObserver;
  globalThis.structuredClone = originalStructuredClone;
});
beforeEach(() => {
  initialContext = undefined;
  refetch.mockReset();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});
async function clickSetup() {
  await act(async () => {
    root.render(
      <ChakraProvider value={defaultSystem}>
        <ConceptNoteWorkspace cityId="city" runId="run" lng="en" />
      </ChakraProvider>,
    );
  });
  const button = [...container.querySelectorAll("button")].find(
    (item) => item.getAttribute("aria-label") === "open-funding-setup",
  );
  expect(button).toBeDefined();
  await act(async () => button!.click());
}

it("opens funding after a successful context retry without a second click", async () => {
  await clickSetup();
  expect(refetch).toHaveBeenCalledTimes(1);
  expect(container.querySelector('[role="dialog"]')).toBeNull();
  await act(async () => finishRefetch(true));
  expect(container.querySelector('[role="dialog"]')).not.toBeNull();
});

it("keeps funding closed after a failed context retry and allows another attempt", async () => {
  await clickSetup();
  await act(async () => finishRefetch(false));
  expect(container.querySelector('[role="dialog"]')).toBeNull();
  await clickSetup();
  await act(async () => finishRefetch(true));
  expect(refetch).toHaveBeenCalledTimes(2);
  expect(container.querySelector('[role="dialog"]')).not.toBeNull();
});

it("opens funding immediately when context is already loaded", async () => {
  initialContext = context;
  await clickSetup();
  expect(refetch).not.toHaveBeenCalled();
  expect(container.querySelector('[role="dialog"]')).not.toBeNull();
});
