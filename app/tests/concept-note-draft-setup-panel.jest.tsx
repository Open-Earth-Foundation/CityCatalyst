/** @jest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, jest } from "@jest/globals";
import { ChakraProvider } from "@chakra-ui/react";
import { appTheme } from "@/lib/theme/recipes/app-theme";
import type { ConceptNoteContextPresentation } from "@/components/ConceptNoteWorkspace/context-status";
import type { ConceptNoteBundleProgress } from "@/components/ConceptNoteDashboard/utils";
import { LuDatabase } from "react-icons/lu";

jest.unstable_mockModule("@/i18n/client", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const { DraftSetupPanel } =
  await import("@/components/ConceptNoteWorkspace/draft-setup-panel");

let root: Root;
let container: HTMLDivElement;

const bundle: ConceptNoteBundleProgress = {
  status: "building",
  documentGrounding: null,
  availableContext: {
    city: true,
    project: false,
    ghgi: false,
    ccra: false,
    hiap: false,
    uploadedDocuments: false,
  },
  missingContext: [],
  readySources: 0,
  queuedSources: 0,
  processingSources: 1,
  failedSources: 0,
  cityPopulation: null,
  ghgiStatus: null,
  hiapStatus: null,
  retryable: false,
};

function status(
  state: ConceptNoteContextPresentation["state"],
  busy: boolean,
): ConceptNoteContextPresentation {
  return {
    state,
    busy,
    blocked: busy,
    actionIcon: LuDatabase,
    actionLabel: "review-context",
    color: "content.link",
    description: "description",
    icon: LuDatabase,
    surface: "base.light",
    title: "title",
  } as ConceptNoteContextPresentation;
}

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  globalThis.structuredClone = (value) => JSON.parse(JSON.stringify(value));
  container = document.createElement("div");
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  globalThis.IS_REACT_ACT_ENVIRONMENT = false;
});

async function render(
  contextStatus: ConceptNoteContextPresentation,
  canStartDrafting: boolean,
) {
  await act(async () =>
    root.render(
      <ChakraProvider value={appTheme}>
        <DraftSetupPanel
          applicationContext={null}
          applicationContextFailed={false}
          applicationContextLoading={false}
          bundle={bundle}
          contextStatus={contextStatus}
          canStartDrafting={canStartDrafting}
          draft={null}
          draftError={null}
          isDraftRunning={false}
          isRetrying={false}
          isStartingDraft={false}
          lng="en"
          onOpenContext={() => {}}
          onOpenFundingSetup={() => {}}
          onRetry={() => {}}
          onStartDrafting={() => {}}
        />
      </ChakraProvider>,
    ),
  );
}

it("keeps Start drafting visible but disabled with a reason while sources process", async () => {
  await render(status("processing", true), true);
  const button = container.querySelector<HTMLButtonElement>(
    '[data-testid="concept-note-start-drafting"]',
  );
  expect(button).not.toBeNull();
  expect(button?.disabled).toBe(true);
  expect(button?.getAttribute("aria-describedby")).toBe(
    "drafting-blocked-reason",
  );
  expect(
    container.querySelector(
      '[data-testid="concept-note-start-drafting-reason"]',
    )?.textContent,
  ).toBe("drafting-blocked-context");
});

it("points at the funding setup reason when context is ready but funding is missing", async () => {
  await render(status("none", false), false);
  const button = container.querySelector<HTMLButtonElement>(
    '[data-testid="concept-note-start-drafting"]',
  );
  expect(button?.disabled).toBe(true);
  expect(button?.getAttribute("aria-describedby")).toBe(
    "drafting-setup-reason",
  );
  expect(container.querySelector("#drafting-setup-reason")).not.toBeNull();
  expect(
    container.querySelector(
      '[data-testid="concept-note-start-drafting-reason"]',
    ),
  ).toBeNull();
});
