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
import { ChakraProvider } from "@chakra-ui/react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import type { ConceptNoteBundleProgress } from "@/components/ConceptNoteDashboard/utils";
import { appTheme } from "@/lib/theme/recipes/app-theme";
import type { ConceptNoteDraftState } from "@/util/types";

const translations: Record<string, string> = {
  "draft-preview-document-title": "{{name}} — Concept note",
  "draft-sections": "Sections",
  "hide-chapter-panel": "Hide chapter panel",
  "jump-to-chapter": "Jump to {{chapter}}",
  "show-chapter-panel": "Show chapter panel",
};

jest.unstable_mockModule("@/i18n/client", () => ({
  useTranslation: () => ({
    t: (key: string, values?: Record<string, string | number>) => {
      let value = translations[key] ?? key;
      for (const [name, replacement] of Object.entries(values ?? {})) {
        value = value.replace(`{{${name}}}`, String(replacement));
      }
      return value;
    },
  }),
}));

let DraftTab: typeof import("@/components/ConceptNoteWorkspace/draft-tab").DraftTab;
let container: HTMLDivElement;
let root: Root;

const bundle: ConceptNoteBundleProgress = {
  availableContext: {
    ccra: false,
    city: true,
    ghgi: true,
    hiap: false,
    project: true,
    uploadedDocuments: false,
  },
  documentGrounding: "none",
  failedSources: 0,
  ghgiStatus: "ready",
  hiapStatus: null,
  missingContext: [],
  processingSources: 0,
  queuedSources: 0,
  readySources: 3,
  retryable: false,
  status: "ready",
};

const draft: ConceptNoteDraftState = {
  chapters: [
    {
      body_markdown: "# Project summary\n\nDraft body",
      chapter_id: "chapter-1",
      missing_information: [],
      position: 0,
      required: true,
      revision_number: 1,
      status: "ready",
      template_section_id: "project-summary",
      title: "Project summary",
      user_locked: false,
      validation: null,
    },
  ],
  completed_chapters: 1,
  current_chapter_id: "chapter-1",
  error_code: null,
  run_id: "run-1",
  status: "complete",
  total_chapters: 1,
};

function button(label: string): HTMLButtonElement {
  const match = document.body.querySelector(`button[aria-label="${label}"]`);
  if (!(match instanceof HTMLButtonElement)) {
    throw new Error(`Button not found: ${label}`);
  }
  return match;
}

async function click(label: string): Promise<void> {
  await act(async () => {
    button(label).dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });
}

function cloneForTest<Value>(value: Value): Value {
  return JSON.parse(JSON.stringify(value)) as Value;
}

beforeAll(async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  globalThis.structuredClone = cloneForTest;
  globalThis.ResizeObserver = class {
    disconnect() {}
    observe() {}
    unobserve() {}
  };
  ({ DraftTab } = await import("@/components/ConceptNoteWorkspace/draft-tab"));
});

afterAll(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = false;
});

beforeEach(() => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

describe("Concept Note draft chapter panel", () => {
  it("hides and restores the chapter panel with one click", async () => {
    await act(async () => {
      root.render(
        <ChakraProvider value={appTheme}>
          <DraftTab
            applicationContext={null}
            applicationContextFailed={false}
            applicationContextLoading={false}
            bundle={bundle}
            canStartDrafting
            draft={draft}
            draftError={null}
            focusChapterId={null}
            isDraftRunning={false}
            isRetrying={false}
            isStartingDraft={false}
            lng="en"
            noteName="Kraków Tram"
            onOpenContext={jest.fn()}
            onRetry={jest.fn()}
            onStartDrafting={jest.fn()}
          />
        </ChakraProvider>,
      );
    });

    expect(button("Hide chapter panel").getAttribute("aria-expanded")).toBe(
      "true",
    );
    expect(button("Jump to Project summary")).toBeTruthy();
    expect(document.getElementById("concept-note-chapter-list")?.hidden).toBe(
      false,
    );

    await click("Hide chapter panel");
    expect(button("Show chapter panel").getAttribute("aria-expanded")).toBe(
      "false",
    );
    expect(document.getElementById("concept-note-chapter-list")?.hidden).toBe(
      true,
    );

    await click("Show chapter panel");
    expect(button("Jump to Project summary")).toBeTruthy();
    expect(document.getElementById("concept-note-chapter-list")?.hidden).toBe(
      false,
    );
  });
});
